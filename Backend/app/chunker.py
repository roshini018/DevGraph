"""AST symbol extraction and semantic code chunking for DevGraph."""

import hashlib
from typing import Any
from tree_sitter import Node, Tree
from app.models import CodeChunk, ParsedSymbol


def _node_text(node: Node, source_bytes: bytes) -> str:
    """Extract decoded text from an AST node."""
    return source_bytes[node.start_byte : node.end_byte].decode(
        "utf-8", errors="replace"
    )


def _get_line_slice(lines: list[str], start_line: int, end_line: int) -> str:
    """Extract 1-indexed inclusive line range from lines list."""
    start_idx = max(0, start_line - 1)
    end_idx = min(len(lines), end_line)
    return "\n".join(lines[start_idx:end_idx])


def _generate_chunk_id(
    repo_id: str,
    file_path: str,
    kind: str,
    symbol_name: str | None,
    start_line: int,
    end_line: int,
) -> str:
    """Generate a deterministic stable chunk ID."""
    clean_repo = repo_id or "local"
    raw_key = f"{clean_repo}:{file_path}:{kind}:{symbol_name or 'none'}:{start_line}:{end_line}"
    digest = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:16]
    return f"chk_{digest}"


def _estimate_tokens(text: str) -> int:
    """Estimate token count for code content (approx 4 chars per token)."""
    return max(1, len(text) // 4)


def _extract_python_docstring(body_node: Node | None, source_bytes: bytes) -> str | None:
    """Extract Python docstring from a function/class body if present."""
    if not body_node or not body_node.children:
        return None
    first_stmt = body_node.children[0]
    if first_stmt.type == "expression_statement" and first_stmt.children:
        expr = first_stmt.children[0]
        if expr.type in ("string", "concatenated_string"):
            raw = _node_text(expr, source_bytes).strip()
            # Strip triple quotes
            for quote in ('"""', "'''"):
                if raw.startswith(quote) and raw.endswith(quote) and len(raw) >= 6:
                    return raw[3:-3].strip()
            # Strip single/double quotes
            if (raw.startswith('"') and raw.endswith('"')) or (
                raw.startswith("'") and raw.endswith("'")
            ):
                return raw[1:-1].strip()
            return raw
    return None


def extract_symbols(
    tree: Tree | None,
    source_bytes: bytes,
    canonical_lang: str,
) -> list[ParsedSymbol]:
    """Walk Tree-sitter AST and extract function, class, method, and import symbols.

    Returns a list of ParsedSymbol with accurate 1-indexed line numbers and signatures.
    """
    if not tree or not tree.root_node:
        return []

    symbols: list[ParsedSymbol] = []
    root = tree.root_node

    if canonical_lang == "python":
        symbols.extend(_extract_python_symbols(root, source_bytes))
    elif canonical_lang in ("javascript", "typescript", "tsx"):
        symbols.extend(_extract_js_ts_symbols(root, source_bytes, canonical_lang))

    return symbols


def _extract_python_symbols(root: Node, source_bytes: bytes) -> list[ParsedSymbol]:
    """Extract Python functions, classes, methods, and imports."""
    symbols: list[ParsedSymbol] = []

    for child in root.children:
        actual_node = child
        # Unwrap decorated definition if present
        if child.type == "decorated_definition":
            for c in child.children:
                if c.type in ("function_definition", "class_definition"):
                    actual_node = c
                    break

        # Functions
        if actual_node.type == "function_definition":
            name_node = actual_node.child_by_field_name("name")
            name = _node_text(name_node, source_bytes) if name_node else "anonymous"
            body = actual_node.child_by_field_name("body")
            docstring = _extract_python_docstring(body, source_bytes)
            # Signature: take first line of definition
            first_line = _node_text(actual_node, source_bytes).splitlines()[0].strip()
            symbols.append(
                ParsedSymbol(
                    name=name,
                    kind="function",
                    start_line=child.start_point.row + 1,
                    end_line=child.end_point.row + 1,
                    start_col=child.start_point.column,
                    end_col=child.end_point.column,
                    signature=first_line,
                    docstring=docstring,
                    parent=None,
                )
            )

        # Classes
        elif actual_node.type == "class_definition":
            class_name_node = actual_node.child_by_field_name("name")
            class_name = (
                _node_text(class_name_node, source_bytes)
                if class_name_node
                else "anonymous"
            )
            body = actual_node.child_by_field_name("body")
            docstring = _extract_python_docstring(body, source_bytes)
            first_line = _node_text(actual_node, source_bytes).splitlines()[0].strip()
            symbols.append(
                ParsedSymbol(
                    name=class_name,
                    kind="class",
                    start_line=child.start_point.row + 1,
                    end_line=child.end_point.row + 1,
                    start_col=child.start_point.column,
                    end_col=child.end_point.column,
                    signature=first_line,
                    docstring=docstring,
                    parent=None,
                )
            )

            # Methods inside class body
            if body:
                for b_child in body.children:
                    m_node = b_child
                    if b_child.type == "decorated_definition":
                        for c in b_child.children:
                            if c.type == "function_definition":
                                m_node = c
                                break
                    if m_node.type == "function_definition":
                        m_name_node = m_node.child_by_field_name("name")
                        m_name = (
                            _node_text(m_name_node, source_bytes)
                            if m_name_node
                            else "anonymous"
                        )
                        m_body = m_node.child_by_field_name("body")
                        m_docstring = _extract_python_docstring(m_body, source_bytes)
                        m_sig = (
                            _node_text(m_node, source_bytes).splitlines()[0].strip()
                        )
                        symbols.append(
                            ParsedSymbol(
                                name=m_name,
                                kind="method",
                                start_line=b_child.start_point.row + 1,
                                end_line=b_child.end_point.row + 1,
                                start_col=b_child.start_point.column,
                                end_col=b_child.end_point.column,
                                signature=m_sig,
                                docstring=m_docstring,
                                parent=class_name,
                            )
                        )

        # Imports
        elif child.type in ("import_statement", "import_from_statement"):
            raw_import = _node_text(child, source_bytes).strip()
            symbols.append(
                ParsedSymbol(
                    name=raw_import.splitlines()[0],
                    kind="import",
                    start_line=child.start_point.row + 1,
                    end_line=child.end_point.row + 1,
                    start_col=child.start_point.column,
                    end_col=child.end_point.column,
                    signature=raw_import,
                    docstring=None,
                    parent=None,
                )
            )

    return symbols


def _extract_js_ts_symbols(
    root: Node,
    source_bytes: bytes,
    canonical_lang: str,
) -> list[ParsedSymbol]:
    """Extract JS/TS functions, classes, interfaces, methods, and imports."""
    symbols: list[ParsedSymbol] = []

    for child in root.children:
        target = child
        # Unwrap export statements
        if child.type == "export_statement":
            decl = child.child_by_field_name("declaration")
            if decl:
                target = decl

        # Functions
        if target.type in ("function_declaration", "generator_function_declaration"):
            name_node = target.child_by_field_name("name")
            name = _node_text(name_node, source_bytes) if name_node else "anonymous"
            sig = _node_text(target, source_bytes).splitlines()[0].strip()
            symbols.append(
                ParsedSymbol(
                    name=name,
                    kind="function",
                    start_line=child.start_point.row + 1,
                    end_line=child.end_point.row + 1,
                    start_col=child.start_point.column,
                    end_col=child.end_point.column,
                    signature=sig,
                    docstring=None,
                    parent=None,
                )
            )

        # Classes
        elif target.type == "class_declaration":
            name_node = target.child_by_field_name("name")
            name = _node_text(name_node, source_bytes) if name_node else "anonymous"
            sig = _node_text(target, source_bytes).splitlines()[0].strip()
            symbols.append(
                ParsedSymbol(
                    name=name,
                    kind="class",
                    start_line=child.start_point.row + 1,
                    end_line=child.end_point.row + 1,
                    start_col=child.start_point.column,
                    end_col=child.end_point.column,
                    signature=sig,
                    docstring=None,
                    parent=None,
                )
            )

            # Methods inside class_body
            body = target.child_by_field_name("body")
            if body:
                for b_child in body.children:
                    if b_child.type == "method_definition":
                        m_name_node = b_child.child_by_field_name("name")
                        m_name = (
                            _node_text(m_name_node, source_bytes)
                            if m_name_node
                            else "anonymous"
                        )
                        m_sig = (
                            _node_text(b_child, source_bytes).splitlines()[0].strip()
                        )
                        symbols.append(
                            ParsedSymbol(
                                name=m_name,
                                kind="method",
                                start_line=b_child.start_point.row + 1,
                                end_line=b_child.end_point.row + 1,
                                start_col=b_child.start_point.column,
                                end_col=b_child.end_point.column,
                                signature=m_sig,
                                docstring=None,
                                parent=name,
                            )
                        )

        # TypeScript Interfaces
        elif target.type == "interface_declaration":
            name_node = target.child_by_field_name("name")
            name = _node_text(name_node, source_bytes) if name_node else "anonymous"
            sig = _node_text(target, source_bytes).splitlines()[0].strip()
            symbols.append(
                ParsedSymbol(
                    name=name,
                    kind="interface",
                    start_line=child.start_point.row + 1,
                    end_line=child.end_point.row + 1,
                    start_col=child.start_point.column,
                    end_col=child.end_point.column,
                    signature=sig,
                    docstring=None,
                    parent=None,
                )
            )

        # Lexical variable declarations with arrow functions, functions, or require imports
        elif target.type in ("lexical_declaration", "variable_declaration"):
            raw_text = _node_text(target, source_bytes).strip()
            if "require(" in raw_text or "require (" in raw_text:
                symbols.append(
                    ParsedSymbol(
                        name=raw_text.splitlines()[0],
                        kind="import",
                        start_line=child.start_point.row + 1,
                        end_line=child.end_point.row + 1,
                        start_col=child.start_point.column,
                        end_col=child.end_point.column,
                        signature=raw_text,
                        docstring=None,
                        parent=None,
                    )
                )

            for decl in target.children:
                if decl.type == "variable_declarator":
                    val_node = decl.child_by_field_name("value")
                    name_node = decl.child_by_field_name("name")
                    if (
                        val_node
                        and val_node.type in ("arrow_function", "function_expression")
                        and name_node
                    ):
                        name = _node_text(name_node, source_bytes)
                        sig = (
                            _node_text(child, source_bytes).splitlines()[0].strip()
                        )
                        symbols.append(
                            ParsedSymbol(
                                name=name,
                                kind="function",
                                start_line=child.start_point.row + 1,
                                end_line=child.end_point.row + 1,
                                start_col=child.start_point.column,
                                end_col=child.end_point.column,
                                signature=sig,
                                docstring=None,
                                parent=None,
                            )
                        )

        # Standalone expression statement with require
        elif target.type == "expression_statement":
            raw_text = _node_text(target, source_bytes).strip()
            if "require(" in raw_text or "require (" in raw_text:
                symbols.append(
                    ParsedSymbol(
                        name=raw_text.splitlines()[0],
                        kind="import",
                        start_line=child.start_point.row + 1,
                        end_line=child.end_point.row + 1,
                        start_col=child.start_point.column,
                        end_col=child.end_point.column,
                        signature=raw_text,
                        docstring=None,
                        parent=None,
                    )
                )

        # Imports
        elif child.type == "import_statement":
            raw_import = _node_text(child, source_bytes).strip()
            symbols.append(
                ParsedSymbol(
                    name=raw_import.splitlines()[0],
                    kind="import",
                    start_line=child.start_point.row + 1,
                    end_line=child.end_point.row + 1,
                    start_col=child.start_point.column,
                    end_col=child.end_point.column,
                    signature=raw_import,
                    docstring=None,
                    parent=None,
                )
            )

    return symbols


def chunk_file(
    content: str,
    symbols: list[ParsedSymbol],
    file_path: str,
    repo_id: str = "",
    language: str = "Unknown",
) -> list[CodeChunk]:
    """Generate meaningful semantic code chunks from source content and symbols.

    Produces:
    1. Import block chunk (grouping top-level imports together)
    2. Class definition chunks
    3. Method definition chunks (scoped with parent class context)
    4. Standalone function chunks
    5. Fallback sliding chunks if no symbols exist in non-empty file
    """
    if not content or not content.strip():
        return []

    lines = content.splitlines()
    total_lines = len(lines)
    chunks: list[CodeChunk] = []

    # 1. Group consecutive imports into import_block chunks
    import_symbols = [s for s in symbols if s.kind == "import"]
    if import_symbols:
        start_line = min(s.start_line for s in import_symbols)
        end_line = max(s.end_line for s in import_symbols)
        chunk_content = _get_line_slice(lines, start_line, end_line)
        if chunk_content.strip():
            chunks.append(
                CodeChunk(
                    chunk_id=_generate_chunk_id(
                        repo_id, file_path, "import_block", "imports", start_line, end_line
                    ),
                    repo_id=repo_id,
                    file_path=file_path,
                    language=language,
                    kind="import_block",
                    symbol_name="imports",
                    start_line=start_line,
                    end_line=end_line,
                    content=chunk_content,
                    context=f"file {file_path}",
                    token_count=_estimate_tokens(chunk_content),
                )
            )

    # 2. Add classes, methods, and functions
    for sym in symbols:
        if sym.kind in ("class", "interface"):
            chunk_content = _get_line_slice(lines, sym.start_line, sym.end_line)
            if chunk_content.strip():
                chunks.append(
                    CodeChunk(
                        chunk_id=_generate_chunk_id(
                            repo_id,
                            file_path,
                            sym.kind,
                            sym.name,
                            sym.start_line,
                            sym.end_line,
                        ),
                        repo_id=repo_id,
                        file_path=file_path,
                        language=language,
                        kind=sym.kind,
                        symbol_name=sym.name,
                        start_line=sym.start_line,
                        end_line=sym.end_line,
                        start_col=sym.start_col,
                        end_col=sym.end_col,
                        content=chunk_content,
                        context=f"class {sym.name}",
                        token_count=_estimate_tokens(chunk_content),
                    )
                )

        elif sym.kind == "method":
            chunk_content = _get_line_slice(lines, sym.start_line, sym.end_line)
            if chunk_content.strip():
                context_str = f"class {sym.parent}" if sym.parent else f"file {file_path}"
                chunks.append(
                    CodeChunk(
                        chunk_id=_generate_chunk_id(
                            repo_id,
                            file_path,
                            "method",
                            sym.name,
                            sym.start_line,
                            sym.end_line,
                        ),
                        repo_id=repo_id,
                        file_path=file_path,
                        language=language,
                        kind="method",
                        symbol_name=sym.name,
                        start_line=sym.start_line,
                        end_line=sym.end_line,
                        start_col=sym.start_col,
                        end_col=sym.end_col,
                        content=chunk_content,
                        context=context_str,
                        token_count=_estimate_tokens(chunk_content),
                    )
                )

        elif sym.kind == "function":
            chunk_content = _get_line_slice(lines, sym.start_line, sym.end_line)
            if chunk_content.strip():
                chunks.append(
                    CodeChunk(
                        chunk_id=_generate_chunk_id(
                            repo_id,
                            file_path,
                            "function",
                            sym.name,
                            sym.start_line,
                            sym.end_line,
                        ),
                        repo_id=repo_id,
                        file_path=file_path,
                        language=language,
                        kind="function",
                        symbol_name=sym.name,
                        start_line=sym.start_line,
                        end_line=sym.end_line,
                        start_col=sym.start_col,
                        end_col=sym.end_col,
                        content=chunk_content,
                        context=f"file {file_path}",
                        token_count=_estimate_tokens(chunk_content),
                    )
                )

    # 3. Fallback: If no function/class/interface chunks generated, chunk by line blocks
    symbol_chunks = [c for c in chunks if c.kind in ("function", "class", "method", "interface")]
    if not symbol_chunks and total_lines > 0:
        chunk_size = 50
        overlap = 10
        step = max(1, chunk_size - overlap)
        for start_idx in range(0, total_lines, step):
            end_idx = min(total_lines, start_idx + chunk_size)
            s_line = start_idx + 1
            e_line = end_idx
            chunk_content = _get_line_slice(lines, s_line, e_line)
            if chunk_content.strip():
                chunks.append(
                    CodeChunk(
                        chunk_id=_generate_chunk_id(
                            repo_id, file_path, "code_block", None, s_line, e_line
                        ),
                        repo_id=repo_id,
                        file_path=file_path,
                        language=language,
                        kind="code_block",
                        symbol_name=None,
                        start_line=s_line,
                        end_line=e_line,
                        content=chunk_content,
                        context=f"file {file_path}",
                        token_count=_estimate_tokens(chunk_content),
                    )
                )
            if end_idx >= total_lines:
                break

    # Sort chunks by start_line
    chunks.sort(key=lambda c: (c.start_line, c.end_line))
    return chunks
