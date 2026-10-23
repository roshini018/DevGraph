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
    js_matches = re.findall(r'''(?:import|from|require\s*\()\s*['\"]([^'\"]+)['\"]''', stmt)
    if js_matches:
        return js_matches
    # Python: from pkg.module import ...
    py_from = re.findall(r'''from\s+([.\w]+)\s+import''', stmt)
    if py_from:
        return py_from
    # Python: import pkg.module
    py_imp = re.findall(r'''import\s+([\w.]+)''', stmt)
    if py_imp:
        return py_imp
    return []


def resolve_import_target(stmt: str, current_file: str, all_files: set[str]) -> str | None:
    """Resolve an import statement to a target file existing in the repository."""
    specs = extract_import_specifiers(stmt)
    if not specs:
        return None

    for spec in specs:
        raw = spec.strip()
        candidate_bases: list[str] = []

        if raw.startswith("@/"):
            sub = raw[2:]
            candidate_bases.extend([sub, f"src/{sub}"])
        elif raw.startswith("~"):
            sub = raw[1:].lstrip("/")
            candidate_bases.extend([sub, f"src/{sub}"])
        elif raw.startswith("."):
            curr_dir = posixpath.dirname(current_file)
            candidate_bases.append(posixpath.normpath(posixpath.join(curr_dir, raw)))
        else:
            candidate_bases.append(raw)
            candidate_bases.append(f"src/{raw}")
            if "." in raw and "/" not in raw:
                # Python dotted package
                candidate_bases.append(raw.replace(".", "/"))

        for base in candidate_bases:
            candidates = [
                base,
                f"{base}.tsx",
                f"{base}.ts",
                f"{base}.jsx",
                f"{base}.js",
                f"{base}.py",
                f"{base}/index.tsx",
                f"{base}/index.ts",
                f"{base}/index.jsx",
                f"{base}/index.js",
            ]
            for c in candidates:
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
    """Traverse an AST node and find direct function invocation identifiers with line numbers."""
    calls = []
    if canonical_lang == "python" and node.type == "call":
        func_node = node.child_by_field_name("function")
        if func_node and func_node.type == "identifier":
            calls.append((func_node.text.decode("utf-8", errors="replace"), node.start_point.row + 1))
    elif canonical_lang in ("javascript", "typescript", "tsx") and node.type == "call_expression":
        func_node = node.child_by_field_name("function")
        if func_node and func_node.type == "identifier":
            calls.append((func_node.text.decode("utf-8", errors="replace"), node.start_point.row + 1))

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
    unambiguously matches an existing defined function/method in the same file.
    Does NOT guess across unknown external references or built-ins.
    """
    tree, source_bytes, canonical_lang, _, _ = parse_source(content, path)
    if not tree or not canonical_lang:
        return []

    calls: list[dict[str, Any]] = []

    def walk_callers(node: Any, current_caller: str | None):
        nonlocal calls
        caller_name = current_caller
        if canonical_lang == "python":
            if node.type in ("function_definition",):
                name_node = node.child_by_field_name("name")
                if name_node:
                    caller_name = name_node.text.decode("utf-8", errors="replace")
                body = node.child_by_field_name("body")
                if body:
                    for raw_callee, call_line in _find_calls_in_node(body, canonical_lang):
                        if raw_callee in known_symbol_names and raw_callee != caller_name:
                            calls.append({
                                "caller": caller_name,
                                "callee": raw_callee,
                                "line": call_line,
                            })
                return
        elif canonical_lang in ("javascript", "typescript", "tsx"):
            if node.type in ("function_declaration", "method_definition"):
                name_node = node.child_by_field_name("name")
                if name_node:
                    caller_name = name_node.text.decode("utf-8", errors="replace")
                body = node.child_by_field_name("body")
                if body:
                    for raw_callee, call_line in _find_calls_in_node(body, canonical_lang):
                        if raw_callee in known_symbol_names and raw_callee != caller_name:
                            calls.append({
                                "caller": caller_name,
                                "callee": raw_callee,
                                "line": call_line,
                            })
                return

        for child in node.children:
            walk_callers(child, caller_name)

    walk_callers(tree.root_node, None)
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

        file_func_names = set()

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
                file_func_names.add(sym.name)
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
                file_func_names.add(sym.name)
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

        # Reliable intra-file CALLS resolution
        if file_contents and clean_path in file_contents and file_func_names:
            content_str = file_contents[clean_path]
            raw_calls = extract_reliable_calls(content_str, clean_path, file_func_names)
            for c in raw_calls:
                calls_batch.append({
                    "file_id": file_id,
                    "repo_id": repo_id,
                    "caller_name": c["caller"],
                    "callee_name": c["callee"],
                    "line": c["line"],
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
            UNWIND $calls AS c
            MATCH (caller {repo_id: c.repo_id})
            WHERE (caller:Function OR caller:Method) AND caller.file_path ENDS WITH c.file_id
               OR (caller:Function AND caller.id STARTS WITH c.file_id AND caller.name = c.caller_name)
               OR (caller:Method AND caller.id STARTS WITH c.file_id AND caller.name = c.caller_name)
            MATCH (callee {repo_id: c.repo_id})
            WHERE (callee:Function AND callee.id STARTS WITH c.file_id AND callee.name = c.callee_name)
               OR (callee:Method AND callee.id STARTS WITH c.file_id AND callee.name = c.callee_name)
            MERGE (caller)-[rel:CALLS {line: c.line}]->(callee)
            """
            # Direct exact caller/callee ID matching
            exact_calls = []
            for item in calls_batch:
                f_id = item["file_id"]
                exact_calls.append({
                    "repo_id": item["repo_id"],
                    "caller_id": f"{f_id}:function:{item['caller_name']}",
                    "callee_id": f"{f_id}:function:{item['callee_name']}",
                    "line": item["line"],
                })
            exact_calls_query = """
            UNWIND $exact_calls AS call
            MATCH (caller:Function {id: call.caller_id})
            MATCH (callee:Function {id: call.callee_id})
            MERGE (caller)-[rel:CALLS {line: call.line}]->(callee)
            """
            res = await session.run(exact_calls_query, {"exact_calls": exact_calls})
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
                if s_id not in nodes_map:
                    s_path = s_node.get("path", s_id)
                    nodes_map[s_id] = GraphNode(
                        id=s_id,
                        label=s_path.split("/")[-1] if "/" in s_path else s_path,
                        kind="file",
                        file=s_path,
                    )
                if t_id not in nodes_map:
                    t_path = t_node.get("path", t_id)
                    nodes_map[t_id] = GraphNode(
                        id=t_id,
                        label=t_path.split("/")[-1] if "/" in t_path else t_path,
                        kind="file",
                        file=t_path,
                    )

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

    nodes_list = list(nodes_map.values())
    return GraphElementsResponse(
        repo_id=clean_id,
        nodes=nodes_list,
        edges=edges_list,
        total_nodes=len(nodes_list),
        total_edges=len(edges_list),
    )

