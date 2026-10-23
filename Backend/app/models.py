from typing import Any
from pydantic import BaseModel, ConfigDict, Field


class ParsedSymbol(BaseModel):
    """Represents a code symbol extracted via AST parsing (function, class, method, import)."""

    model_config = ConfigDict(extra="ignore")

    name: str = Field(..., description="Symbol identifier or imported entity")
    kind: str = Field(
        ...,
        description="Type of symbol: 'function', 'class', 'method', 'import', 'interface'",
    )
    start_line: int = Field(..., description="1-indexed starting line")
    end_line: int = Field(..., description="1-indexed ending line")
    start_col: int = Field(0, description="0-indexed starting column")
    end_col: int = Field(0, description="0-indexed ending column")
    signature: str | None = Field(
        None, description="Signature line or declaration header"
    )
    docstring: str | None = Field(
        None, description="Extracted docstring or documentation comments"
    )
    parent: str | None = Field(
        None, description="Parent container, such as enclosing class name"
    )


class CodeChunk(BaseModel):
    """Represents a meaningful semantic chunk of code ready for embedding and indexing."""

    model_config = ConfigDict(extra="ignore")

    chunk_id: str = Field(
        ...,
        description="Stable deterministic ID based on repo, path, kind, symbol, and range",
    )
    repo_id: str = Field("", description="Repository identifier (e.g. 'owner-repo')")
    file_path: str = Field(..., description="Repository-relative file path")
    language: str = Field(..., description="Programming language name")
    kind: str = Field(
        ...,
        description="Chunk category: 'function', 'class', 'method', 'import_block', 'code_block', 'module_header'",
    )
    symbol_name: str | None = Field(
        None, description="Name of the principal symbol in this chunk, if any"
    )
    start_line: int = Field(..., description="1-indexed starting line")
    end_line: int = Field(..., description="1-indexed ending line")
    start_col: int = Field(0, description="0-indexed starting column")
    end_col: int = Field(0, description="0-indexed ending column")
    content: str = Field(..., description="Raw text of the chunk")
    context: str | None = Field(
        None, description="Enclosing context (e.g. parent class, file scope)"
    )
    token_count: int = Field(0, description="Estimated token count for chunk content")


class FileParseResult(BaseModel):
    """Result of parsing and chunking a single source file."""

    model_config = ConfigDict(extra="ignore")

    path: str = Field(..., description="Relative file path")
    language: str = Field(..., description="Detected programming language")
    analyzed: bool = Field(True, description="Whether parsing was attempted")
    symbols: list[ParsedSymbol] = Field(
        default_factory=list, description="Extracted code symbols"
    )
    chunks: list[CodeChunk] = Field(
        default_factory=list, description="Semantic code chunks"
    )
    lines_count: int = Field(0, description="Total line count")
    size_bytes: int = Field(0, description="File size in bytes")
    has_syntax_errors: bool = Field(
        False, description="Whether syntax errors were encountered during parsing"
    )
    error_message: str | None = Field(
        None, description="Error message if parsing completely failed"
    )


class ParseFileRequest(BaseModel):
    """Request payload for parsing a single file."""

    model_config = ConfigDict(extra="ignore")

    path: str = Field(..., description="Repository-relative file path to parse")
    content: str | None = Field(
        None,
        description="Optional source code content; if omitted, content is fetched via GitHub API",
    )


class ParseTreeRequest(BaseModel):
    """Request payload for batch parsing an entire repository tree."""

    model_config = ConfigDict(extra="ignore")

    extensions: list[str] = Field(
        default=[".py", ".js", ".jsx", ".ts", ".tsx"],
        description="File extensions to include in parse batch",
    )
    max_files: int = Field(
        50,
        ge=1,
        le=500,
        description="Maximum number of files to parse in this batch",
    )


class BatchParseSummary(BaseModel):
    """Summary statistics for batch repository tree parsing."""

    model_config = ConfigDict(extra="ignore")

    total_files_in_tree: int = Field(0, description="Total entries in Git tree")
    eligible_files: int = Field(
        0, description="Files matching target extensions"
    )
    parsed_files: int = Field(0, description="Files successfully parsed")
    skipped_files: int = Field(0, description="Files skipped (binary, unparseable, limit)")
    total_symbols: int = Field(0, description="Total symbols extracted across all files")
    total_chunks: int = Field(0, description="Total chunks generated across all files")


class BatchParseResponse(BaseModel):
    """Response payload for repository batch parsing."""

    model_config = ConfigDict(extra="ignore")

    repo_id: str = Field(..., description="Target repository ID")
    summary: BatchParseSummary = Field(..., description="Batch summary statistics")
    results: list[FileParseResult] = Field(
        default_factory=list, description="List of per-file parse results"
    )


# ===========================================================================
# Graph Domain Models
# ===========================================================================

class GraphNode(BaseModel):
    """Represents a node in the Neo4j Knowledge Graph."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(..., description="Unique node identifier")
    label: str = Field(..., description="Display label (e.g. name or relative path)")
    kind: str = Field(
        ...,
        description="Node category: 'repository', 'file', 'class', 'function', 'method', 'interface', 'import', 'code_chunk'",
    )
    file: str | None = Field(None, description="Repository-relative file path")
    start_line: int | None = Field(None, description="1-indexed starting line")
    end_line: int | None = Field(None, description="1-indexed ending line")
    signature: str | None = Field(None, description="Signature line or declaration")
    docstring: str | None = Field(None, description="Extracted documentation")
    language: str | None = Field(None, description="Programming language")
    properties: dict[str, Any] = Field(
        default_factory=dict, description="Additional arbitrary node properties"
    )


class GraphEdge(BaseModel):
    """Represents a relationship edge in the Neo4j Knowledge Graph."""

    model_config = ConfigDict(extra="ignore")

    id: str = Field(..., description="Unique edge identifier")
    source: str = Field(..., description="Source node identifier")
    target: str = Field(..., description="Target node identifier")
    kind: str = Field(
        ...,
        description="Relationship type: 'CONTAINS', 'DEFINES', 'IMPORTS', 'HAS_CHUNK', 'CALLS'",
    )
    properties: dict[str, Any] = Field(
        default_factory=dict, description="Edge properties (e.g. line numbers)"
    )


class GraphElementsResponse(BaseModel):
    """Graph response containing nodes and edges for visualization or traversal."""

    model_config = ConfigDict(extra="ignore")

    repo_id: str = Field(..., description="Repository ID")
    nodes: list[GraphNode] = Field(default_factory=list, description="Graph nodes")
    edges: list[GraphEdge] = Field(default_factory=list, description="Graph edges")
    total_nodes: int = Field(0, description="Total node count returned")
    total_edges: int = Field(0, description="Total edge count returned")


class GraphStatsResponse(BaseModel):
    """Detailed summary statistics of graph entities for a repository."""

    model_config = ConfigDict(extra="ignore")

    repo_id: str = Field(..., description="Repository ID")
    files_count: int = Field(0, description="Number of File nodes")
    classes_count: int = Field(0, description="Number of Class nodes")
    functions_count: int = Field(0, description="Number of Function nodes")
    methods_count: int = Field(0, description="Number of Method nodes")
    interfaces_count: int = Field(0, description="Number of Interface nodes")
    imports_count: int = Field(0, description="Number of Import nodes")
    chunks_count: int = Field(0, description="Number of CodeChunk nodes")
    total_symbols: int = Field(0, description="Total symbol nodes (classes, functions, methods, interfaces, imports)")
    relationships_count: int = Field(0, description="Total relationship edges")
    node_counts_by_label: dict[str, int] = Field(
        default_factory=dict, description="Counts grouped by Neo4j label"
    )
    relationship_counts_by_type: dict[str, int] = Field(
        default_factory=dict, description="Counts grouped by relationship type"
    )


class GraphIndexRequest(BaseModel):
    """Request payload for indexing a repository into the Knowledge Graph."""

    model_config = ConfigDict(extra="ignore")

    extensions: list[str] = Field(
        default=[".py", ".js", ".jsx", ".ts", ".tsx"],
        description="File extensions to parse and index into the graph",
    )
    max_files: int = Field(
        50,
        ge=1,
        le=500,
        description="Maximum number of files to ingest in one batch",
    )
    clear_existing: bool = Field(
        True,
        description="If True, cleanly removes previous repository graph entities before re-indexing to prevent stale nodes",
    )


class GraphIndexSummary(BaseModel):
    """Summary of graph indexing execution."""

    model_config = ConfigDict(extra="ignore")

    repo_id: str = Field(..., description="Target repository ID")
    files_indexed: int = Field(0, description="Files successfully indexed")
    nodes_created: int = Field(0, description="Total nodes created or updated")
    relationships_created: int = Field(0, description="Total relationships created")
    symbols_indexed: int = Field(0, description="Total symbols ingested")
    chunks_indexed: int = Field(0, description="Total code chunks ingested")
    duration_ms: float = Field(0.0, description="Total execution duration in milliseconds")
    files_failed: int = Field(0, description="Files that failed to fetch or parse")
    failed_files: list[dict[str, str]] = Field(
        default_factory=list, description="List of failed files with path and reason"
    )
    success: bool = Field(True, description="Whether indexing completed successfully")
    error: str | None = Field(None, description="Error message if indexing failed")
