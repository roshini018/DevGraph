"""Neo4j Knowledge Graph construction, idempotent ingestion, and query service for DevGraph."""

import posixpath
import re
import time
from typing import Any
from neo4j import AsyncDriver
from app.models import (
    CodeChunk,
    FileParseResult,
    GraphEdge,
    GraphElementsResponse,
    GraphIndexSummary,
    GraphNode,
    GraphStatsResponse,
    ParsedSymbol,
)
from app.parser import parse_source


# ===========================================================================
# Schema Constraints & Indexes
# ===========================================================================

# Unique constraint statements (ensures MERGE idempotency and zero duplicates)
_CONSTRAINT_STATEMENTS = [
    "CREATE CONSTRAINT constraint_repo_id IF NOT EXISTS FOR (r:Repository) REQUIRE r.id IS UNIQUE",
    "CREATE CONSTRAINT constraint_file_id IF NOT EXISTS FOR (f:File) REQUIRE f.id IS UNIQUE",
    "CREATE CONSTRAINT constraint_class_id IF NOT EXISTS FOR (c:Class) REQUIRE c.id IS UNIQUE",
    "CREATE CONSTRAINT constraint_func_id IF NOT EXISTS FOR (fn:Function) REQUIRE fn.id IS UNIQUE",
    "CREATE CONSTRAINT constraint_method_id IF NOT EXISTS FOR (m:Method) REQUIRE m.id IS UNIQUE",
    "CREATE CONSTRAINT constraint_iface_id IF NOT EXISTS FOR (i:Interface) REQUIRE i.id IS UNIQUE",
    "CREATE CONSTRAINT constraint_import_id IF NOT EXISTS FOR (imp:Import) REQUIRE imp.id IS UNIQUE",
    "CREATE CONSTRAINT constraint_chunk_id IF NOT EXISTS FOR (chk:CodeChunk) REQUIRE chk.id IS UNIQUE",
]

# Lookup indexes by repo_id for high-performance scoped deletes and queries
_INDEX_STATEMENTS = [
    "CREATE INDEX index_file_repo_id IF NOT EXISTS FOR (f:File) ON (f.repo_id)",
    "CREATE INDEX index_class_repo_id IF NOT EXISTS FOR (c:Class) ON (c.repo_id)",
    "CREATE INDEX index_func_repo_id IF NOT EXISTS FOR (fn:Function) ON (fn.repo_id)",
    "CREATE INDEX index_method_repo_id IF NOT EXISTS FOR (m:Method) ON (m.repo_id)",
    "CREATE INDEX index_iface_repo_id IF NOT EXISTS FOR (i:Interface) ON (i.repo_id)",
    "CREATE INDEX index_import_repo_id IF NOT EXISTS FOR (imp:Import) ON (imp.repo_id)",
    "CREATE INDEX index_chunk_repo_id IF NOT EXISTS FOR (chk:CodeChunk) ON (chk.repo_id)",
]


async def ensure_schema_constraints(driver: AsyncDriver, database: str | None = None) -> list[str]:
    """Create uniqueness constraints and lookup indexes in Neo4j if they don't already exist."""
    created = []
    kwargs = {"database": database} if database else {}
    async with driver.session(**kwargs) as session:
        for stmt in _CONSTRAINT_STATEMENTS + _INDEX_STATEMENTS:
            try:
                await session.run(stmt)
                created.append(stmt.split()[2])
            except Exception as exc:
                # Some Neo4j configurations may throw if already in transition
                pass
    return created


# ===========================================================================
# Safe Scoped Repository Graph Deletion & ID Resolution
# ===========================================================================

def get_candidate_repo_ids(repo_id: str) -> list[str]:
    """Return all valid identifier variants for a repository in Neo4j queries.

    Handles 'owner/repo', 'owner-repo', 'owner__repo', and bare repo names
    consistently without mutating user input.
    """
    clean = (repo_id or "").strip().lower()
    candidates = {clean}
    if "/" in clean:
        parts = clean.split("/", 1)
        candidates.add(f"{parts[0]}-{parts[1]}")
        candidates.add(f"{parts[0]}__{parts[1]}")
        candidates.add(parts[1])
    elif "__" in clean:
        parts = clean.split("__", 1)
        candidates.add(f"{parts[0]}/{parts[1]}")
        candidates.add(f"{parts[0]}-{parts[1]}")
        candidates.add(parts[1])
    elif "-" in clean:
        parts = clean.split("-", 1)
        candidates.add(f"{parts[0]}/{parts[1]}")
        candidates.add(f"{parts[0]}__{parts[1]}")
    return [c for c in candidates if c]


def normalize_repo_id(repo_id: str) -> tuple[str, str]:
    """Normalize any repo_id variant into (canonical_slug, hyphen_slug).

    Examples:
      'owner/MyRepo'    -> ('owner/myrepo',    'owner-myrepo')
      'owner-MyRepo'    -> ('owner/myrepo',    'owner-myrepo')
      'owner__MyRepo'   -> ('owner/myrepo',    'owner-myrepo')
      'single-repo'     -> ('single/repo',     'single-repo')
    """
    clean = (repo_id or "").strip().lower()
    if "/" in clean:
        parts = clean.split("/", 1)
        return clean, f"{parts[0]}-{parts[1]}"
    if "__" in clean:
        parts = clean.split("__", 1)
        return f"{parts[0]}/{parts[1]}", f"{parts[0]}-{parts[1]}"
    if "-" in clean and not clean.startswith("-") and not clean.endswith("-"):
        parts = clean.split("-", 1)
        # Only treat hyphen as owner-repo if neither part is empty
        return f"{parts[0]}/{parts[1]}", clean
    return clean, clean


def extract_import_specifiers(stmt: str) -> list[str]:
    """Extract imported module paths from JS/TS or Python import statements."""
    if not stmt:
        return []
    # JS/TS: import ... from '...' or import '...' or require('...')
    js_matches = re.findall(r"""(?:import|from|require\s*\()\s*['"]([^'"]+)['"]""", stmt)
    if js_matches:
        return js_matches
    # Python: from pkg.module import ...
    py_from = re.findall(r"""from\s+([.\w]+)\s+import""", stmt)
    if py_from:
        return py_from
    # Python: import pkg.module
    py_imp = re.findall(r"""import\s+([\w.]+)""", stmt)
    if py_imp:
        return py_imp
    return []


def resolve_import_target(stmt: str, current_file: str, all_files: set[str]) -> str | None:
    """Resolve an import statement to a target file existing in the repository."""
    if not stmt:
        return None
    curr_dir = posixpath.dirname(current_file) if "/" in current_file else ""
    candidate_bases: list[str] = []

    # 1. Python relative import: from .foo import bar OR from . import foo OR from ..foo import bar
    py_rel = re.match(r"^\s*from\s+(\.+)([\w.]*)\s+import\s+(.*)", stmt)
    if py_rel:
        dots, mod, names_str = py_rel.group(1), py_rel.group(2), py_rel.group(3)
        up = len(dots) - 1
        parts = curr_dir.split("/") if curr_dir else []
        if up >= len(parts):
            target_base_dir = ""
        elif up == 0:
            target_base_dir = curr_dir
        else:
            target_base_dir = "/".join(parts[:-up])

        if mod:
            sub = mod.replace(".", "/")
            candidate_bases.append(posixpath.join(target_base_dir, sub).lstrip("/"))
        else:
            names = [n.strip().split()[0] for n in names_str.split(",") if n.strip()]
            for name in names:
                candidate_bases.append(posixpath.join(target_base_dir, name).lstrip("/"))

    # 2. JS/TS or standard quoted imports: import ... from '...'
    specs = re.findall(r"""(?:import|from|require\s*\()\s*['"]([^'"]+)['"]""", stmt)
    for raw in specs:
        raw = raw.strip()
        if raw.startswith("@/"):
            sub = raw[2:]
            candidate_bases.extend([sub, f"src/{sub}"])
        elif raw.startswith("~"):
            sub = raw[1:].lstrip("/")
            candidate_bases.extend([sub, f"src/{sub}"])
        elif raw.startswith("."):
            candidate_bases.append(posixpath.normpath(posixpath.join(curr_dir, raw)).lstrip("/"))
        else:
            candidate_bases.extend([raw, f"src/{raw}"])
            if "." in raw and "/" not in raw:
                candidate_bases.append(raw.replace(".", "/"))

    # 3. Python standard: from pkg.module import ...
    py_from = re.findall(r"from\s+([\w.]+)\s+import", stmt)
    for pf in py_from:
        if not pf.startswith("."):
            sub = pf.replace(".", "/")
            candidate_bases.extend([sub, f"src/{sub}"])

    # 4. Python standard: import pkg.module
    py_imp = re.findall(r"import\s+([\w.]+)", stmt)
    for pi in py_imp:
        if not pi.startswith("."):
            sub = pi.replace(".", "/")
            candidate_bases.extend([sub, f"src/{sub}"])

    for base in candidate_bases:
        base = base.strip("/")
        for ext in [
            "",
            ".py",
            ".ts",
            ".tsx",
            ".js",
            ".jsx",
            "/__init__.py",
            "/index.ts",
            "/index.tsx",
            "/index.js",
        ]:
            c = (base + ext).strip("/")
            if c in all_files and c != current_file:
                return c

    return None


async def clear_repository_graph(
    driver: AsyncDriver,
    repo_id: str,
    database: str | None = None,
    delete_repo_node: bool = False,
) -> int:
    """Safely delete all graph elements belonging strictly to a single repository.

    Uses explicit, bounded queries scoped strictly by `{repo_id: $repo_id}`.
    Never uses unbounded variable-length traversals to prevent accidental deletion of unrelated repositories.
    """
    canonical_id, hyphen_id = normalize_repo_id(repo_id)
    repo_ids = list({canonical_id, hyphen_id})
    total_deleted = 0
    kwargs = {"database": database} if database else {}

    # Scoped deletion statements in dependency order (leaf nodes first)
    deletion_queries = [
        "MATCH (chk:CodeChunk) WHERE chk.repo_id IN $repo_ids DETACH DELETE chk",
        "MATCH (imp:Import) WHERE imp.repo_id IN $repo_ids DETACH DELETE imp",
        "MATCH (m:Method) WHERE m.repo_id IN $repo_ids DETACH DELETE m",
        "MATCH (c:Class) WHERE c.repo_id IN $repo_ids DETACH DELETE c",
        "MATCH (i:Interface) WHERE i.repo_id IN $repo_ids DETACH DELETE i",
        "MATCH (fn:Function) WHERE fn.repo_id IN $repo_ids DETACH DELETE fn",
        "MATCH (f:File) WHERE f.repo_id IN $repo_ids DETACH DELETE f",
    ]

    if delete_repo_node:
        deletion_queries.append("MATCH (r:Repository) WHERE r.id IN $repo_ids DETACH DELETE r")

    async with driver.session(**kwargs) as session:
        for query in deletion_queries:
            result = await session.run(query, {"repo_ids": repo_ids})
            summary = await result.consume()
            total_deleted += summary.counters.nodes_deleted

    return total_deleted


# ===========================================================================
# Reliable Call Extraction (Zero Guessing)
# ===========================================================================

def _find_calls_in_node(node: Any, canonical_lang: str) -> list[tuple[str, int]]:
    """Traverse an AST node and find direct function and method invocation identifiers with line numbers."""
    calls = []
    if canonical_lang == "python" and node.type == "call":
        func_node = node.child_by_field_name("function")
        if func_node:
            if func_node.type == "identifier":
                calls.append((func_node.text.decode("utf-8", errors="replace"), node.start_point.row + 1))
            elif func_node.type == "attribute":
                attr_node = func_node.child_by_field_name("attribute")
                if attr_node:
                    calls.append((attr_node.text.decode("utf-8", errors="replace"), node.start_point.row + 1))
    elif canonical_lang in ("javascript", "typescript", "tsx") and node.type == "call_expression":
        func_node = node.child_by_field_name("function")
        if func_node:
            if func_node.type == "identifier":
                calls.append((func_node.text.decode("utf-8", errors="replace"), node.start_point.row + 1))
            elif func_node.type == "member_expression":
                prop_node = func_node.child_by_field_name("property")
                if prop_node:
                    calls.append((prop_node.text.decode("utf-8", errors="replace"), node.start_point.row + 1))

    for child in node.children:
        calls.extend(_find_calls_in_node(child, canonical_lang))
    return calls


def extract_reliable_calls(
    content: str,
    path: str,
    known_symbol_names: set[str],
) -> list[dict[str, Any]]:
    """Extract CALLS relationships ONLY when the caller and callee can be reliably resolved.

    Specifically: caller is a function or method in the file, and callee identifier
    unambiguously matches an existing defined function/method in the file or imported scope.
    """
    tree, source_bytes, canonical_lang, _, _ = parse_source(content, path)
    if not tree or not canonical_lang:
        return []

    calls: list[dict[str, Any]] = []

    def walk_callers(node: Any, current_class: str | None = None, current_caller: str | None = None):
        nonlocal calls
        cur_cls = current_class
        caller_name = current_caller

        if canonical_lang == "python":
            if node.type == "class_definition":
                name_node = node.child_by_field_name("name")
                if name_node:
                    cur_cls = name_node.text.decode("utf-8", errors="replace")
                body = node.child_by_field_name("body")
                if body:
                    for child in body.children:
                        walk_callers(child, current_class=cur_cls, current_caller=None)
                return
            elif node.type == "function_definition":
                name_node = node.child_by_field_name("name")
                if name_node:
                    caller_name = name_node.text.decode("utf-8", errors="replace")
                body = node.child_by_field_name("body")
                if body and caller_name:
                    for raw_callee, call_line in _find_calls_in_node(body, canonical_lang):
                        if raw_callee in known_symbol_names and raw_callee != caller_name:
                            calls.append({
                                "caller": caller_name,
                                "caller_class": cur_cls,
                                "callee": raw_callee,
                                "line": call_line,
                            })
                return
        elif canonical_lang in ("javascript", "typescript", "tsx"):
            if node.type == "class_declaration":
                name_node = node.child_by_field_name("name")
                if name_node:
                    cur_cls = name_node.text.decode("utf-8", errors="replace")
                body = node.child_by_field_name("body")
                if body:
                    for child in body.children:
                        walk_callers(child, current_class=cur_cls, current_caller=None)
                return
            elif node.type in ("function_declaration", "method_definition"):
                name_node = node.child_by_field_name("name")
                if name_node:
                    caller_name = name_node.text.decode("utf-8", errors="replace")
                body = node.child_by_field_name("body")
                if body and caller_name:
                    for raw_callee, call_line in _find_calls_in_node(body, canonical_lang):
                        if raw_callee in known_symbol_names and raw_callee != caller_name:
                            calls.append({
                                "caller": caller_name,
                                "caller_class": cur_cls,
                                "callee": raw_callee,
                                "line": call_line,
                            })
                return

        for child in node.children:
            walk_callers(child, current_class=cur_cls, current_caller=caller_name)

    walk_callers(tree.root_node, None, None)
    return calls


# ===========================================================================
# Knowledge Graph Ingestion Engine (Parameterized & Idempotent)
# ===========================================================================

async def ingest_repository_graph(
    driver: AsyncDriver,
    repo_info: dict[str, Any],
    parsed_files: list[FileParseResult],
    file_contents: dict[str, str] | None = None,
    database: str | None = None,
    clear_existing: bool = True,
) -> GraphIndexSummary:
    """Ingest repository entities, symbols, chunks, and relationships into Neo4j.

    Guarantees:
    - Zero duplicates: uses uniqueness constraints and parameterized MERGE statements
    - Re-indexing safety: cleanly deletes existing entities for repo_id if clear_existing is True
    - Strict scope: all nodes tagged with repo_id
    """
    start_time = time.time()
    repo_id = str(repo_info.get("repo_id", "")).strip().lower()
    if not repo_id:
        raise ValueError("Repository info must contain a valid 'repo_id'")

    kwargs = {"database": database} if database else {}

    # 1. Ensure schema constraints exist
    await ensure_schema_constraints(driver, database)

    # 2. Scoped cleanup of previous repository graph (prevents stale nodes on re-indexing)
    if clear_existing:
        await clear_repository_graph(driver, repo_id, database, delete_repo_node=False)

    nodes_created = 0
    relationships_created = 0
    total_symbols = 0
    total_chunks = 0
    files_indexed = 0

    # 3. Prepare batch payloads
    all_file_paths = {p.path.strip().lstrip("/") for p in parsed_files if p.path}
    files_batch = []
    classes_batch = []
    methods_batch = []
    functions_batch = []
    interfaces_batch = []
    imports_batch = []
    file_imports_batch = []
    chunks_batch = []
    calls_batch = []
    inherits_batch = []

    symbol_id_by_name: dict[str, list[str]] = {}
    file_symbols: dict[str, dict[str, str]] = {}
    file_imports_map: dict[str, dict[str, str]] = {}

    for file_res in parsed_files:
        clean_path = file_res.path.strip().lstrip("/")
        if not clean_path:
            continue

        file_id = f"{repo_id}:{clean_path}"
        ext = "." + clean_path.split(".")[-1].lower() if "." in clean_path else ""
        file_name = clean_path.split("/")[-1]

        files_batch.append({
            "id": file_id,
            "repo_id": repo_id,
            "path": clean_path,
            "name": file_name,
            "language": file_res.language,
            "lines": file_res.lines_count,
            "size_bytes": file_res.size_bytes,
            "extension": ext,
        })
        files_indexed += 1

        file_symbols[clean_path] = {}

        for sym in file_res.symbols:
            total_symbols += 1
            if sym.kind == "class":
                class_id = f"{file_id}:class:{sym.name}"
                classes_batch.append({
                    "id": class_id,
                    "file_id": file_id,
                    "repo_id": repo_id,
                    "file_path": clean_path,
                    "name": sym.name,
                    "signature": sym.signature or f"class {sym.name}",
                    "docstring": sym.docstring or "",
                    "start_line": sym.start_line,
                    "end_line": sym.end_line,
                })
                file_symbols[clean_path][sym.name] = class_id
                symbol_id_by_name.setdefault(sym.name, []).append(class_id)
                if getattr(sym, "inherits", None):
                    for base in sym.inherits:
                        inherits_batch.append({
                            "child_id": class_id,
                            "base_name": base,
                            "repo_id": repo_id,
                            "file_path": clean_path,
                        })
            elif sym.kind == "method":
                parent_cls = sym.parent or "anonymous"
                class_id = f"{file_id}:class:{parent_cls}"
                method_id = f"{file_id}:method:{parent_cls}:{sym.name}"
                methods_batch.append({
                    "id": method_id,
                    "class_id": class_id,
                    "file_id": file_id,
                    "repo_id": repo_id,
                    "file_path": clean_path,
                    "name": sym.name,
                    "parent_class": parent_cls,
                    "signature": sym.signature or f"def {sym.name}",
                    "docstring": sym.docstring or "",
                    "start_line": sym.start_line,
                    "end_line": sym.end_line,
                })
                file_symbols[clean_path][f"{parent_cls}.{sym.name}"] = method_id
                file_symbols[clean_path][sym.name] = method_id
                symbol_id_by_name.setdefault(sym.name, []).append(method_id)
                symbol_id_by_name.setdefault(f"{parent_cls}.{sym.name}", []).append(method_id)
            elif sym.kind == "function":
                func_id = f"{file_id}:function:{sym.name}"
                functions_batch.append({
                    "id": func_id,
                    "file_id": file_id,
                    "repo_id": repo_id,
                    "file_path": clean_path,
                    "name": sym.name,
                    "signature": sym.signature or f"def {sym.name}",
                    "docstring": sym.docstring or "",
                    "start_line": sym.start_line,
                    "end_line": sym.end_line,
                })
                file_symbols[clean_path][sym.name] = func_id
                symbol_id_by_name.setdefault(sym.name, []).append(func_id)
            elif sym.kind == "interface":
                iface_id = f"{file_id}:interface:{sym.name}"
                interfaces_batch.append({
                    "id": iface_id,
                    "file_id": file_id,
                    "repo_id": repo_id,
                    "file_path": clean_path,
                    "name": sym.name,
                    "signature": sym.signature or f"interface {sym.name}",
                    "start_line": sym.start_line,
                    "end_line": sym.end_line,
                })
                file_symbols[clean_path][sym.name] = iface_id
                symbol_id_by_name.setdefault(sym.name, []).append(iface_id)
                if getattr(sym, "inherits", None):
                    for base in sym.inherits:
                        inherits_batch.append({
                            "child_id": iface_id,
                            "base_name": base,
                            "repo_id": repo_id,
                            "file_path": clean_path,
                        })
            elif sym.kind == "import":
                import_id = f"{file_id}:import:{sym.start_line}"
                imports_batch.append({
                    "id": import_id,
                    "file_id": file_id,
                    "repo_id": repo_id,
                    "file_path": clean_path,
                    "name": sym.name,
                    "start_line": sym.start_line,
                    "end_line": sym.end_line,
                })
                # Inter-file import dependency resolution
                target_file = resolve_import_target(sym.signature or sym.name, clean_path, all_file_paths)
                if target_file and target_file != clean_path:
                    file_imports_batch.append({
                        "source_id": file_id,
                        "target_id": f"{repo_id}:{target_file}",
                        "repo_id": repo_id,
                        "line": sym.start_line,
                    })
                    imp_stmt = sym.signature or sym.name
                    if "import" in imp_stmt:
                        after_imp = imp_stmt.split("import")[-1]
                        for piece in after_imp.split(","):
                            c_name = piece.strip().split()[0]
                            if c_name and c_name not in ("*", "(", ")"):
                                file_imports_map.setdefault(clean_path, {})[c_name] = target_file

        for chk in file_res.chunks:
            total_chunks += 1
            chunks_batch.append({
                "id": chk.chunk_id,
                "file_id": file_id,
                "repo_id": repo_id,
                "file_path": clean_path,
                "kind": chk.kind,
                "symbol_name": chk.symbol_name or "",
                "start_line": chk.start_line,
                "end_line": chk.end_line,
                "content": chk.content,
                "context": chk.context or "",
                "token_count": chk.token_count,
            })

    # Reliable CALLS resolution across all files
    for file_res in parsed_files:
        clean_path = file_res.path.strip().lstrip("/")
        file_id = f"{repo_id}:{clean_path}"
        if file_contents and clean_path in file_contents:
            content_str = file_contents[clean_path]
            local_map = file_symbols.get(clean_path, {})
            imported_map = file_imports_map.get(clean_path, {})
            candidate_names = set(local_map.keys())
            candidate_names.update(imported_map.keys())
            candidate_names.update(symbol_id_by_name.keys())

            raw_calls = extract_reliable_calls(content_str, clean_path, candidate_names)
            for c in raw_calls:
                c_caller = c["caller"]
                c_parent = c.get("caller_class")
                c_callee = c["callee"]
                c_line = c["line"]

                if c_parent:
                    caller_id = f"{file_id}:method:{c_parent}:{c_caller}"
                else:
                    caller_id = f"{file_id}:function:{c_caller}"

                callee_id = None
                if c_parent and f"{c_parent}.{c_callee}" in local_map:
                    callee_id = local_map[f"{c_parent}.{c_callee}"]
                elif c_callee in local_map:
                    callee_id = local_map[c_callee]
                elif c_callee in imported_map:
                    tgt = imported_map[c_callee]
                    tgt_map = file_symbols.get(tgt, {})
                    if c_callee in tgt_map:
                        callee_id = tgt_map[c_callee]
                    else:
                        callee_id = f"{repo_id}:{tgt}:function:{c_callee}"
                elif c_callee in symbol_id_by_name and len(symbol_id_by_name[c_callee]) == 1:
                    callee_id = symbol_id_by_name[c_callee][0]

                if callee_id and callee_id != caller_id:
                    calls_batch.append({
                        "caller_id": caller_id,
                        "callee_id": callee_id,
                        "line": c_line,
                    })

    # Resolve INHERITS relationships across all files
    resolved_inherits_batch = []
    for inh in inherits_batch:
        child_id = inh["child_id"]
        base = inh["base_name"]
        f_path = inh["file_path"]
        parent_id = None
        local_map = file_symbols.get(f_path, {})
        imported_map = file_imports_map.get(f_path, {})

        if base in local_map:
            parent_id = local_map[base]
        elif base in imported_map:
            tgt_file = imported_map[base]
            tgt_map = file_symbols.get(tgt_file, {})
            if base in tgt_map:
                parent_id = tgt_map[base]
            else:
                parent_id = f"{repo_id}:{tgt_file}:class:{base}"
        elif base in symbol_id_by_name:
            for cand in symbol_id_by_name[base]:
                if ":class:" in cand or ":interface:" in cand:
                    parent_id = cand
                    break
            if not parent_id and len(symbol_id_by_name[base]) == 1:
                parent_id = symbol_id_by_name[base][0]

        if parent_id and parent_id != child_id:
            resolved_inherits_batch.append({
                "child_id": child_id,
                "parent_id": parent_id,
            })

    # 4. Execute Parameterized Batch Merges in Transaction
    async with driver.session(**kwargs) as session:
        # Repository Node
        repo_query = """
        MERGE (r:Repository {id: $repo_id})
        SET r.name = $name,
            r.owner = $owner,
            r.full_name = $full_name,
            r.default_branch = $default_branch,
            r.updated_at = datetime()
        """
        r_res = await session.run(
            repo_query,
            {
                "repo_id": repo_id,
                "name": repo_info.get("repo_name", repo_id),
                "owner": repo_info.get("owner", repo_id.split("-")[0]),
                "full_name": repo_info.get("full_name", repo_id),
                "default_branch": repo_info.get("default_branch", "main"),
            },
        )
        r_sum = await r_res.consume()
        nodes_created += r_sum.counters.nodes_created

        # Files Batch
        if files_batch:
            files_query = """
            UNWIND $files AS f
            MERGE (file:File {id: f.id})
            SET file.repo_id = f.repo_id,
                file.path = f.path,
                file.name = f.name,
                file.language = f.language,
                file.lines = f.lines,
                file.size_bytes = f.size_bytes,
                file.extension = f.extension
            WITH file, f
            MATCH (r:Repository {id: f.repo_id})
            MERGE (r)-[:CONTAINS]->(file)
            """
            res = await session.run(files_query, {"files": files_batch})
            s = await res.consume()
            nodes_created += s.counters.nodes_created
            relationships_created += s.counters.relationships_created

        # Classes Batch
        if classes_batch:
            classes_query = """
            UNWIND $classes AS c
            MERGE (cls:Class {id: c.id})
            SET cls.repo_id = c.repo_id,
                cls.file_path = c.file_path,
                cls.name = c.name,
                cls.signature = c.signature,
                cls.docstring = c.docstring,
                cls.start_line = c.start_line,
                cls.end_line = c.end_line
            WITH cls, c
            MATCH (file:File {id: c.file_id})
            MERGE (file)-[:DEFINES]->(cls)
            """
            res = await session.run(classes_query, {"classes": classes_batch})
            s = await res.consume()
            nodes_created += s.counters.nodes_created
            relationships_created += s.counters.relationships_created

        # Methods Batch
        if methods_batch:
            methods_query = """
            UNWIND $methods AS m
            MERGE (meth:Method {id: m.id})
            SET meth.repo_id = m.repo_id,
                meth.file_path = m.file_path,
                meth.name = m.name,
                meth.parent_class = m.parent_class,
                meth.signature = m.signature,
                meth.docstring = m.docstring,
                meth.start_line = m.start_line,
                meth.end_line = m.end_line
            WITH meth, m
            MATCH (cls:Class {id: m.class_id})
            MERGE (cls)-[:DEFINES]->(meth)
            """
            res = await session.run(methods_query, {"methods": methods_batch})
            s = await res.consume()
            nodes_created += s.counters.nodes_created
            relationships_created += s.counters.relationships_created

        # Functions Batch
        if functions_batch:
            functions_query = """
            UNWIND $functions AS fn
            MERGE (func:Function {id: fn.id})
            SET func.repo_id = fn.repo_id,
                func.file_path = fn.file_path,
                func.name = fn.name,
                func.signature = fn.signature,
                func.docstring = fn.docstring,
                func.start_line = fn.start_line,
                func.end_line = fn.end_line
            WITH func, fn
            MATCH (file:File {id: fn.file_id})
            MERGE (file)-[:DEFINES]->(func)
            """
            res = await session.run(functions_query, {"functions": functions_batch})
            s = await res.consume()
            nodes_created += s.counters.nodes_created
            relationships_created += s.counters.relationships_created

        # Interfaces Batch
        if interfaces_batch:
            interfaces_query = """
            UNWIND $interfaces AS iface
            MERGE (i:Interface {id: iface.id})
            SET i.repo_id = iface.repo_id,
                i.file_path = iface.file_path,
                i.name = iface.name,
                i.signature = iface.signature,
                i.start_line = iface.start_line,
                i.end_line = iface.end_line
            WITH i, iface
            MATCH (file:File {id: iface.file_id})
            MERGE (file)-[:DEFINES]->(i)
            """
            res = await session.run(interfaces_query, {"interfaces": interfaces_batch})
            s = await res.consume()
            nodes_created += s.counters.nodes_created
            relationships_created += s.counters.relationships_created

        # Imports Batch
        if imports_batch:
            imports_query = """
            UNWIND $imports AS imp
            MERGE (import_node:Import {id: imp.id})
            SET import_node.repo_id = imp.repo_id,
                import_node.file_path = imp.file_path,
                import_node.name = imp.name,
                import_node.start_line = imp.start_line,
                import_node.end_line = imp.end_line
            WITH import_node, imp
            MATCH (file:File {id: imp.file_id})
            MERGE (file)-[:IMPORTS]->(import_node)
            """
            res = await session.run(imports_query, {"imports": imports_batch})
            s = await res.consume()
            nodes_created += s.counters.nodes_created
            relationships_created += s.counters.relationships_created

        # Code Chunks Batch
        if chunks_batch:
            chunks_query = """
            UNWIND $chunks AS chk
            MERGE (chunk:CodeChunk {id: chk.id})
            SET chunk.repo_id = chk.repo_id,
                chunk.file_path = chk.file_path,
                chunk.kind = chk.kind,
                chunk.symbol_name = chk.symbol_name,
                chunk.start_line = chk.start_line,
                chunk.end_line = chk.end_line,
                chunk.content = chk.content,
                chunk.context = chk.context,
                chunk.token_count = chk.token_count
            WITH chunk, chk
            MATCH (file:File {id: chk.file_id})
            MERGE (file)-[:HAS_CHUNK]->(chunk)
            """
            res = await session.run(chunks_query, {"chunks": chunks_batch})
            s = await res.consume()
            nodes_created += s.counters.nodes_created
            relationships_created += s.counters.relationships_created

        # Reliable CALLS Relationships
        if calls_batch:
            calls_query = """
            UNWIND $calls AS call
            MATCH (caller {id: call.caller_id})
            MATCH (callee {id: call.callee_id})
            MERGE (caller)-[rel:CALLS {line: call.line}]->(callee)
            """
            res = await session.run(calls_query, {"calls": calls_batch})
            s = await res.consume()
            relationships_created += s.counters.relationships_created

        # Class / Interface INHERITS Relationships
        if resolved_inherits_batch:
            inherits_query = """
            UNWIND $inherits AS inh
            MATCH (child {id: inh.child_id})
            MATCH (parent {id: inh.parent_id})
            MERGE (child)-[rel:INHERITS]->(parent)
            """
            res = await session.run(inherits_query, {"inherits": resolved_inherits_batch})
            s = await res.consume()
            relationships_created += s.counters.relationships_created

        # File-to-File IMPORTS Batch
        if file_imports_batch:
            file_imports_query = """
            UNWIND $file_imports AS fi
            MATCH (source:File {id: fi.source_id})
            MATCH (target:File {id: fi.target_id})
            MERGE (source)-[rel:IMPORTS {line: fi.line}]->(target)
            """
            res = await session.run(file_imports_query, {"file_imports": file_imports_batch})
            s = await res.consume()
            relationships_created += s.counters.relationships_created

    duration_ms = round((time.time() - start_time) * 1000, 2)
    return GraphIndexSummary(
        repo_id=repo_id,
        files_indexed=files_indexed,
        nodes_created=nodes_created,
        relationships_created=relationships_created,
        symbols_indexed=total_symbols,
        chunks_indexed=total_chunks,
        duration_ms=duration_ms,
        success=True,
        error=None,
    )


# ===========================================================================
# Graph Statistics & Elements Query Service
# ===========================================================================

async def get_graph_stats(driver: AsyncDriver, repo_id: str, database: str | None = None) -> GraphStatsResponse:
    """Fetch aggregated count statistics for a repository's knowledge graph."""
    clean_id = (repo_id or "").strip().lower()
    repo_ids = get_candidate_repo_ids(repo_id)
    kwargs = {"database": database} if database else {}

    node_counts: dict[str, int] = {}
    rel_counts: dict[str, int] = {}

    stats_query = """
    MATCH (n)
    WHERE n.repo_id IN $repo_ids
    RETURN labels(n) AS lbl, count(n) AS cnt
    """
    rel_query = """
    MATCH (a)-[r]->(b)
    WHERE a.repo_id IN $repo_ids AND b.repo_id IN $repo_ids
    RETURN type(r) AS rel_type, count(r) AS cnt
    """

    async with driver.session(**kwargs) as session:
        n_res = await session.run(stats_query, {"repo_ids": repo_ids})
        async for record in n_res:
            lbl_list = record["lbl"]
            cnt = record["cnt"]
            if lbl_list:
                for l in lbl_list:
                    node_counts[l] = node_counts.get(l, 0) + cnt

        r_res = await session.run(rel_query, {"repo_ids": repo_ids})
        async for record in r_res:
            rel_counts[record["rel_type"]] = record["cnt"]

    files_cnt = node_counts.get("File", 0)
    classes_cnt = node_counts.get("Class", 0)
    functions_cnt = node_counts.get("Function", 0)
    methods_cnt = node_counts.get("Method", 0)
    interfaces_cnt = node_counts.get("Interface", 0)
    imports_cnt = node_counts.get("Import", 0)
    chunks_cnt = node_counts.get("CodeChunk", 0)
    total_symbols = classes_cnt + functions_cnt + methods_cnt + interfaces_cnt + imports_cnt
    total_rels = sum(rel_counts.values())

    return GraphStatsResponse(
        repo_id=clean_id,
        files_count=files_cnt,
        classes_count=classes_cnt,
        functions_count=functions_cnt,
        methods_count=methods_cnt,
        interfaces_count=interfaces_cnt,
        imports_count=imports_cnt,
        chunks_count=chunks_cnt,
        total_symbols=total_symbols,
        relationships_count=total_rels,
        node_counts_by_label=node_counts,
        relationship_counts_by_type=rel_counts,
    )


async def get_graph_elements(
    driver: AsyncDriver,
    repo_id: str,
    limit: int = 500,
    database: str | None = None,
) -> GraphElementsResponse:
    """Fetch nodes and edges for knowledge graph visualization matching the frontend schema."""
    clean_id = (repo_id or "").strip().lower()
    repo_ids = get_candidate_repo_ids(repo_id)
    kwargs = {"database": database} if database else {}

    nodes_map: dict[str, GraphNode] = {}
    edges_list: list[GraphEdge] = []
    seen_edges: set[str] = set()

    def _add_node_if_missing(node_obj, labels_list=None):
        if not node_obj:
            return
        n_id = node_obj.get("id", str(node_obj.element_id))
        if not n_id or n_id in nodes_map:
            return
        labels_set = set(labels_list or [])
        if "File" in labels_set:
            n_kind = "file"
        elif "Class" in labels_set:
            n_kind = "class"
        elif "Method" in labels_set:
            n_kind = "method"
        elif "Function" in labels_set:
            n_kind = "function"
        elif "Interface" in labels_set:
            n_kind = "interface"
        elif "Import" in labels_set:
            n_kind = "import"
        elif labels_list:
            n_kind = labels_list[0].lower()
        else:
            n_kind = "symbol"

        path = node_obj.get("path") or node_obj.get("file_path") or ""
        label = node_obj.get("name") or (path.split("/")[-1] if "/" in path else path) or n_id
        nodes_map[n_id] = GraphNode(
            id=n_id,
            label=label,
            kind=n_kind,
            file=path,
            start_line=node_obj.get("start_line"),
            end_line=node_obj.get("end_line"),
            signature=node_obj.get("signature"),
            docstring=node_obj.get("docstring"),
            language=node_obj.get("language"),
        )

    # Query 1: File nodes (essential for file card layout)
    files_query = """
    MATCH (f:File)
    WHERE f.repo_id IN $repo_ids
    RETURN f
    LIMIT $limit
    """

    # Query 2: Symbol nodes (functions, classes, methods, interfaces, imports)
    symbols_query = """
    MATCH (n)
    WHERE n.repo_id IN $repo_ids
      AND (n:Function OR n:Class OR n:Method OR n:Interface OR n:Import)
    RETURN n, labels(n) AS n_labels
    LIMIT $limit
    """

    # Query 3: Cross-file File->File IMPORTS edges (high priority dependencies)
    file_imports_query = """
    MATCH (source:File)-[r:IMPORTS]->(target:File)
    WHERE source.repo_id IN $repo_ids AND target.repo_id IN $repo_ids
      AND source.id <> target.id
    RETURN source, r, target
    LIMIT $limit
    """

    # Query 4: Cross-file or intra-file CALLS edges
    calls_query = """
    MATCH (source)-[r:CALLS]->(target)
    WHERE source.repo_id IN $repo_ids AND target.repo_id IN $repo_ids
    RETURN source, labels(source) AS s_labels,
           r,
           target, labels(target) AS t_labels
    LIMIT $limit
    """

    # Query 5: Structural DEFINES relationships (File->Symbol, Class->Method)
    defines_query = """
    MATCH (source)-[r:DEFINES]->(target)
    WHERE source.repo_id IN $repo_ids AND target.repo_id IN $repo_ids
    RETURN source, labels(source) AS s_labels,
           r,
           target, labels(target) AS t_labels
    LIMIT $limit
    """

    # Query 6: Class / Interface INHERITS hierarchy
    inherits_query = """
    MATCH (source)-[r:INHERITS]->(target)
    WHERE source.repo_id IN $repo_ids AND target.repo_id IN $repo_ids
    RETURN source, labels(source) AS s_labels,
           r,
           target, labels(target) AS t_labels
    LIMIT $limit
    """

    async with driver.session(**kwargs) as session:
        # 1. Load File nodes
        f_res = await session.run(files_query, {"repo_ids": repo_ids, "limit": limit})
        async for record in f_res:
            f = record["f"]
            f_id = f.get("id", str(f.element_id))
            f_path = f.get("path", f_id)
            if f_id not in nodes_map:
                nodes_map[f_id] = GraphNode(
                    id=f_id,
                    label=f_path.split("/")[-1] if "/" in f_path else f_path,
                    kind="file",
                    file=f_path,
                    start_line=None,
                    end_line=None,
                    signature=None,
                    docstring=None,
                    language=f.get("language"),
                )

        # 2. Load Symbol nodes
        sym_res = await session.run(symbols_query, {"repo_ids": repo_ids, "limit": limit})
        async for record in sym_res:
            n_node = record["n"]
            n_labels = record["n_labels"]
            n_id = n_node.get("id", str(n_node.element_id))
            n_kind = n_labels[0].lower() if n_labels else "unknown"
            n_file = n_node.get("file_path")
            if n_id not in nodes_map:
                nodes_map[n_id] = GraphNode(
                    id=n_id,
                    label=n_node.get("name") or n_id,
                    kind=n_kind,
                    file=n_file,
                    start_line=n_node.get("start_line"),
                    end_line=n_node.get("end_line"),
                    signature=n_node.get("signature"),
                    docstring=n_node.get("docstring"),
                    language=n_node.get("language"),
                )

        # 3. Load File->File IMPORTS edges
        fi_res = await session.run(file_imports_query, {"repo_ids": repo_ids, "limit": limit})
        async for record in fi_res:
            s_node = record["source"]
            t_node = record["target"]
            r_rel = record["r"]
            s_id = s_node.get("id", str(s_node.element_id))
            t_id = t_node.get("id", str(t_node.element_id))
            if s_id and t_id and s_id != t_id:
                edge_id = f"{s_id}->IMPORTS->{t_id}"
                if edge_id not in seen_edges:
                    seen_edges.add(edge_id)
                    edges_list.append(
                        GraphEdge(
                            id=edge_id,
                            source=s_id,
                            target=t_id,
                            kind="IMPORTS",
                            properties={"line": r_rel.get("line")} if r_rel and r_rel.get("line") else {},
                        )
                    )
                _add_node_if_missing(s_node, ["File"])
                _add_node_if_missing(t_node, ["File"])

        # 4. Load CALLS edges
        c_res = await session.run(calls_query, {"repo_ids": repo_ids, "limit": limit})
        async for record in c_res:
            s_node = record["source"]
            t_node = record["target"]
            r_rel = record["r"]
            s_id = s_node.get("id", str(s_node.element_id))
            t_id = t_node.get("id", str(t_node.element_id))
            if s_id and t_id:
                edge_id = f"{s_id}->CALLS->{t_id}"
                if edge_id not in seen_edges:
                    seen_edges.add(edge_id)
                    edges_list.append(
                        GraphEdge(
                            id=edge_id,
                            source=s_id,
                            target=t_id,
                            kind="CALLS",
                            properties={"line": r_rel.get("line")} if r_rel and r_rel.get("line") else {},
                        )
                    )
                _add_node_if_missing(s_node, record.get("s_labels"))
                _add_node_if_missing(t_node, record.get("t_labels"))

        # 5. Load DEFINES edges
        d_res = await session.run(defines_query, {"repo_ids": repo_ids, "limit": limit})
        async for record in d_res:
            s_node = record["source"]
            t_node = record["target"]
            r_rel = record["r"]
            s_id = s_node.get("id", str(s_node.element_id))
            t_id = t_node.get("id", str(t_node.element_id))
            if s_id and t_id:
                edge_id = f"{s_id}->DEFINES->{t_id}"
                if edge_id not in seen_edges:
                    seen_edges.add(edge_id)
                    edges_list.append(
                        GraphEdge(
                            id=edge_id,
                            source=s_id,
                            target=t_id,
                            kind="DEFINES",
                            properties={"line": r_rel.get("line")} if r_rel and r_rel.get("line") else {},
                        )
                    )
                _add_node_if_missing(s_node, record.get("s_labels"))
                _add_node_if_missing(t_node, record.get("t_labels"))

        # 6. Load INHERITS edges
        inh_res = await session.run(inherits_query, {"repo_ids": repo_ids, "limit": limit})
        async for record in inh_res:
            s_node = record["source"]
            t_node = record["target"]
            r_rel = record["r"]
            s_id = s_node.get("id", str(s_node.element_id))
            t_id = t_node.get("id", str(t_node.element_id))
            if s_id and t_id:
                edge_id = f"{s_id}->INHERITS->{t_id}"
                if edge_id not in seen_edges:
                    seen_edges.add(edge_id)
                    edges_list.append(
                        GraphEdge(
                            id=edge_id,
                            source=s_id,
                            target=t_id,
                            kind="INHERITS",
                            properties={"line": r_rel.get("line")} if r_rel and r_rel.get("line") else {},
                        )
                    )
                _add_node_if_missing(s_node, record.get("s_labels"))
                _add_node_if_missing(t_node, record.get("t_labels"))

    # Strictly filter out any edges referencing missing nodes
    edges_list = [e for e in edges_list if e.source in nodes_map and e.target in nodes_map]

    nodes_list = list(nodes_map.values())
    return GraphElementsResponse(
        repo_id=clean_id,
        nodes=nodes_list,
        edges=edges_list,
        total_nodes=len(nodes_list),
        total_edges=len(edges_list),
    )

