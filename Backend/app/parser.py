"""Tree-sitter parser initialization and source code parsing service."""

from pathlib import Path
from typing import Any
import tree_sitter
from tree_sitter import Language, Parser, Tree
import tree_sitter_javascript
import tree_sitter_python
import tree_sitter_typescript

# Grammar mappings
_GRAMMAR_LOADERS = {
    "python": lambda: Language(tree_sitter_python.language()),
    "javascript": lambda: Language(tree_sitter_javascript.language()),
    "typescript": lambda: Language(tree_sitter_typescript.language_typescript()),
    "tsx": lambda: Language(tree_sitter_typescript.language_tsx()),
}

# Extension to canonical language key
_EXT_TO_LANGUAGE = {
    ".py": "python",
    ".pyi": "python",
    ".pyw": "python",
    ".js": "javascript",
    ".jsx": "javascript",
    ".mjs": "javascript",
    ".cjs": "javascript",
    ".ts": "typescript",
    ".mts": "typescript",
    ".cts": "typescript",
    ".tsx": "tsx",
}

# Human-readable names
_CANONICAL_NAMES = {
    "python": "Python",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "tsx": "TypeScript (TSX)",
}

# Cached parser instances
_PARSERS: dict[str, Parser] = {}


def resolve_canonical_language(path_or_lang: str) -> str | None:
    """Resolve a file path, extension, or language name to a canonical grammar key.

    Returns one of: 'python', 'javascript', 'typescript', 'tsx', or None if unsupported.
    """
    clean = path_or_lang.strip().lower()
    if clean.startswith("."):
        return _EXT_TO_LANGUAGE.get(clean)

    # Check as file path
    ext = Path(clean).suffix.lower()
    if ext in _EXT_TO_LANGUAGE:
        return _EXT_TO_LANGUAGE[ext]

    # Check direct name matches
    if clean in ("python", "py"):
        return "python"
    if clean in ("javascript", "js", "jsx"):
        return "javascript"
    if clean in ("typescript", "ts"):
        return "typescript"
    if clean in ("tsx",):
        return "tsx"

    return None


def get_display_language_name(canonical_lang: str) -> str:
    """Return a human-readable display name for a canonical language."""
    return _CANONICAL_NAMES.get(canonical_lang, canonical_lang.capitalize())


def is_parsable_path(path: str) -> bool:
    """Check if the given file path has a supported Tree-sitter grammar."""
    return resolve_canonical_language(path) is not None


def get_parser(canonical_lang: str) -> Parser | None:
    """Retrieve or initialize a cached Tree-sitter Parser instance for a language."""
    if canonical_lang in _PARSERS:
        return _PARSERS[canonical_lang]

    loader = _GRAMMAR_LOADERS.get(canonical_lang)
    if not loader:
        return None

    try:
        lang_obj = loader()
        parser = Parser(lang_obj)
        _PARSERS[canonical_lang] = parser
        return parser
    except Exception as exc:
        return None


def parse_source(
    content: str | bytes,
    path_or_lang: str,
) -> tuple[Tree | None, bytes, str | None, bool, str | None]:
    """Parse source code into a Tree-sitter AST.

    Args:
        content: Raw source code string or bytes.
        path_or_lang: File path or language identifier.

    Returns:
        tuple of:
        - tree: Tree-sitter Tree object, or None if unsupported
        - source_bytes: raw UTF-8 bytes of the source
        - canonical_lang: resolved language key ('python', 'javascript', etc.)
        - has_syntax_errors: True if the AST contains ERROR nodes
        - error_message: Human-readable error description, if any
    """
    canonical_lang = resolve_canonical_language(path_or_lang)
    if not canonical_lang:
        return None, b"", None, False, f"Unsupported language for '{path_or_lang}'"

    if isinstance(content, str):
        source_bytes = content.encode("utf-8")
    else:
        source_bytes = content

    parser = get_parser(canonical_lang)
    if not parser:
        return (
            None,
            source_bytes,
            canonical_lang,
            False,
            f"Failed to initialize parser for language '{canonical_lang}'",
        )

    # Empty content parses cleanly into an empty module/program
    try:
        parser.reset()
        tree = parser.parse(source_bytes)
        has_errors = bool(tree.root_node.has_error)
        return tree, source_bytes, canonical_lang, has_errors, None
    except Exception as exc:
        return None, source_bytes, canonical_lang, True, str(exc)
