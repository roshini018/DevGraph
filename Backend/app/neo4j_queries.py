"""Deep relational traversal, blast radius impact analysis, and connection queries for Neo4j."""

import logging
from typing import Any
from neo4j import AsyncDriver

from app.graph import get_candidate_repo_ids
from app.models import GraphEdge, GraphNode

logger = logging.getLogger(__name__)


def _to_graph_node(n_data: dict[str, Any], labels: list[str] | None = None) -> dict[str, Any]:
    """Convert raw Neo4j node properties to frontend GraphNode dict."""
    n_id = n_data.get("id", "")
    labels_set = set(labels or [])
    if "File" in labels_set:
        kind = "file"
    elif "Class" in labels_set:
        kind = "class"
    elif "Method" in labels_set:
        kind = "method"
    elif "Function" in labels_set:
        kind = "function"
    elif "Interface" in labels_set:
        kind = "function"  # frontend expects SymbolKind
    else:
        kind = labels[0].lower() if labels else "function"

    path = n_data.get("path") or n_data.get("file_path") or ""
    label = n_data.get("name") or (path.split("/")[-1] if "/" in path else path) or n_id

    desc = n_data.get("docstring") or n_data.get("signature") or ""

    return {
        "id": n_id,
        "label": label,
        "kind": kind,
        "file": path,
        "start_line": n_data.get("start_line"),
        "end_line": n_data.get("end_line"),
        "description": desc,
        "metrics": {
            "in_degree": 0,
            "out_degree": 0,
            "symbol_count": 0,
        },
    }


async def query_node_detail(
    driver: AsyncDriver,
    repo_id: str,
    node_id: str,
    database: str | None = None,
) -> dict[str, Any] | None:
    """Fetch deep relationships and context for a specific symbol or file node."""
    repo_ids = get_candidate_repo_ids(repo_id)
    kwargs = {"database": database} if database else {}

    node_query = """
    MATCH (n)
    WHERE n.repo_id IN $repo_ids AND (n.id = $node_id OR n.id ENDS WITH $node_id OR n.name = $node_id)
    RETURN n, labels(n) AS labels
    LIMIT 1
    """

    callers_query = """
    MATCH (caller)-[r:CALLS]->(n)
    WHERE n.id = $exact_id
    RETURN caller, labels(caller) AS labels, r.line AS line
    LIMIT 50
    """

    callees_query = """
    MATCH (n)-[r:CALLS]->(callee)
    WHERE n.id = $exact_id
    RETURN callee, labels(callee) AS labels, r.line AS line
    LIMIT 50
    """

    imports_query = """
    MATCH (n)-[r:IMPORTS]->(target)
    WHERE n.id = $exact_id
    RETURN target, labels(target) AS labels, r.line AS line
    LIMIT 50
    """

    imported_by_query = """
    MATCH (source)-[r:IMPORTS]->(n)
    WHERE n.id = $exact_id
    RETURN source, labels(source) AS labels, r.line AS line
    LIMIT 50
    """

    inherits_query = """
    MATCH (n)-[:INHERITS]->(parent)
    WHERE n.id = $exact_id
    RETURN parent, labels(parent) AS labels
    LIMIT 20
    """

    inherited_by_query = """
    MATCH (child)-[:INHERITS]->(n)
    WHERE n.id = $exact_id
    RETURN child, labels(child) AS labels
    LIMIT 20
    """

    chunk_snippet_query = """
    MATCH (f:File {repo_id: n.repo_id})-[:HAS_CHUNK]->(chk:CodeChunk)
    WHERE n.id = $exact_id AND chk.symbol_name = n.name
    RETURN chk.content AS snippet
    LIMIT 1
    """

    async with driver.session(**kwargs) as session:
        n_res = await session.run(node_query, {"repo_ids": repo_ids, "node_id": node_id})
        n_rec = await n_res.single()
        if not n_rec:
            return None

        n_node = n_rec["n"]
        exact_id = n_node.get("id", str(n_node.element_id))
        target_dict = _to_graph_node(n_node, n_rec["labels"])

        # Fetch callers
        callers: list[dict[str, Any]] = []
        c_res = await session.run(callers_query, {"exact_id": exact_id})
        async for r in c_res:
            callers.append(_to_graph_node(r["caller"], r["labels"]))

        # Fetch callees
        callees: list[dict[str, Any]] = []
        ce_res = await session.run(callees_query, {"exact_id": exact_id})
        async for r in ce_res:
            callees.append(_to_graph_node(r["callee"], r["labels"]))

        # Fetch imports
        imports: list[dict[str, Any]] = []
        imp_res = await session.run(imports_query, {"exact_id": exact_id})
        async for r in imp_res:
            imports.append(_to_graph_node(r["target"], r["labels"]))

        # Fetch imported_by
        imported_by: list[dict[str, Any]] = []
        impb_res = await session.run(imported_by_query, {"exact_id": exact_id})
        async for r in impb_res:
            imported_by.append(_to_graph_node(r["source"], r["labels"]))

        # Fetch inherits
        inherits: list[dict[str, Any]] = []
        inh_res = await session.run(inherits_query, {"exact_id": exact_id})
        async for r in inh_res:
            inherits.append(_to_graph_node(r["parent"], r["labels"]))

        # Fetch inherited_by
        inherited_by: list[dict[str, Any]] = []
        inhb_res = await session.run(inherited_by_query, {"exact_id": exact_id})
        async for r in inhb_res:
            inherited_by.append(_to_graph_node(r["child"], r["labels"]))

        # Source snippet
        source_snippet = n_node.get("signature") or n_node.get("docstring") or ""
        try:
            snip_res = await session.run(
                """
                MATCH (chk:CodeChunk)
                WHERE chk.chunk_id STARTS WITH $exact_id OR (chk.file_path = $path AND chk.symbol_name = $name)
                RETURN chk.content AS snippet
                LIMIT 1
                """,
                {
                    "exact_id": exact_id,
                    "path": n_node.get("file_path", ""),
                    "name": n_node.get("name", ""),
                },
            )
            snip_rec = await snip_res.single()
            if snip_rec and snip_rec["snippet"]:
                source_snippet = snip_rec["snippet"]
        except Exception:
            pass

    return {
        "node": target_dict,
        "callers": callers,
        "callees": callees,
        "imports": imports,
        "imported_by": imported_by,
        "inherits": inherits,
        "inherited_by": inherited_by,
        "source_snippet": source_snippet,
    }


async def query_connection(
    driver: AsyncDriver,
    repo_id: str,
    source: str,
    target: str,
    database: str | None = None,
) -> dict[str, Any]:
    """Find shortest path connectivity between two symbols or files."""
    repo_ids = get_candidate_repo_ids(repo_id)
    kwargs = {"database": database} if database else {}

    path_query = """
    MATCH (source)
    WHERE source.repo_id IN $repo_ids AND (source.id = $source OR source.id ENDS WITH $source OR source.name = $source)
    MATCH (target)
    WHERE target.repo_id IN $repo_ids AND (target.id = $target OR target.id ENDS WITH $target OR target.name = $target)
    MATCH p = shortestPath((source)-[*..6]-(target))
    RETURN [n in nodes(p) | {id: n.id, name: n.name, path: coalesce(n.path, n.file_path, ''), labels: labels(n)}] AS path_nodes,
           [r in relationships(p) | {source: startNode(r).id, target: endNode(r).id, kind: toLower(type(r)), line: coalesce(r.line, 0)}] AS path_edges
    LIMIT 1
    """

    async with driver.session(**kwargs) as session:
        res = await session.run(path_query, {"repo_ids": repo_ids, "source": source, "target": target})
        rec = await res.single()
        if not rec:
            return {
                "source": source,
                "target": target,
                "connected": False,
                "paths": [],
                "edges": [],
            }

        path_nodes = rec["path_nodes"]
        path_edges = rec["path_edges"]

        paths = [[node["id"] for node in path_nodes]]
        edges = [
            {
                "id": f"{e['source']}->{e['kind']}->{e['target']}",
                "source": e["source"],
                "target": e["target"],
                "kind": "imports" if "import" in e["kind"] else ("inherits" if "inherit" in e["kind"] else "calls"),
                "line": e.get("line", 0),
                "resolved": True,
            }
            for e in path_edges
        ]

        return {
            "source": source,
            "target": target,
            "connected": True,
            "paths": paths,
            "edges": edges,
        }


async def query_impact(
    driver: AsyncDriver,
    repo_id: str,
    target_ids: list[str],
    depth: int = 3,
    database: str | None = None,
) -> dict[str, Any]:
    """Compute transitive blast radius impact analysis for modified target symbols."""
    repo_ids = get_candidate_repo_ids(repo_id)
    kwargs = {"database": database} if database else {}
    bounded_depth = max(1, min(depth, 5))

    impact_query = f"""
    MATCH (target)
    WHERE target.repo_id IN $repo_ids
      AND (
        target.id IN $target_ids
        OR target.name IN $target_ids
        OR target.file_path IN $target_ids
        OR any(t IN $target_ids WHERE target.id ENDS WITH (":" + t) OR target.id ENDS WITH ("/" + t))
      )
    MATCH p = (dependent)-[:CALLS|IMPORTS|DEFINES|INHERITS*1..{bounded_depth}]-(target)
    WHERE dependent.repo_id IN $repo_ids AND dependent.id <> target.id
    RETURN dependent.id AS node_id,
           length(p) AS distance,
           [n in nodes(p) | n.id] AS path_nodes
    """

    impacted_map: dict[str, dict[str, Any]] = {}

    async with driver.session(**kwargs) as session:
        res = await session.run(impact_query, {"repo_ids": repo_ids, "target_ids": target_ids})
        async for rec in res:
            n_id = rec["node_id"]
            dist = int(rec["distance"])
            path_nodes = rec["path_nodes"]

            if n_id not in impacted_map or dist < impacted_map[n_id]["distance"]:
                risk = "high" if dist == 1 else ("medium" if dist == 2 else "low")
                impacted_map[n_id] = {
                    "node_id": n_id,
                    "distance": dist,
                    "path": path_nodes,
                    "risk": risk,
                    "direct": dist == 1,
                }

    impacted_nodes = sorted(
        impacted_map.values(),
        key=lambda x: (x["distance"], x["node_id"]),
    )

    return {
        "target_ids": target_ids,
        "impacted_nodes": impacted_nodes,
        "total_impacted": len(impacted_nodes),
        "max_depth": bounded_depth,
    }


async def query_graph_search(
    driver: AsyncDriver,
    repo_id: str,
    query: str,
    limit: int = 20,
    database: str | None = None,
) -> list[dict[str, Any]]:
    """Search for symbols and files in Neo4j matching a query string."""
    repo_ids = get_candidate_repo_ids(repo_id)
    kwargs = {"database": database} if database else {}
    clean_q = query.strip().lower()
    if not clean_q:
        return []

    search_query = """
    MATCH (n)
    WHERE n.repo_id IN $repo_ids
      AND (
        (n:Function OR n:Class OR n:Method OR n:Interface) AND toLower(n.name) CONTAINS $q
        OR (n:File) AND (toLower(n.path) CONTAINS $q OR toLower(n.name) CONTAINS $q)
      )
    RETURN n, labels(n) AS labels
    LIMIT $limit
    """

    matches: list[dict[str, Any]] = []
    async with driver.session(**kwargs) as session:
        res = await session.run(search_query, {"repo_ids": repo_ids, "q": clean_q, "limit": limit})
        async for rec in res:
            node = rec["n"]
            labels = rec["labels"]
            is_file = "File" in labels
            m_type = "file" if is_file else "symbol"
            name = node.get("name") or node.get("path") or ""
            f_path = node.get("path") or node.get("file_path") or ""
            line = node.get("start_line", 1)

            # Score exact / prefix matches higher
            name_lower = name.lower()
            if name_lower == clean_q:
                score = 1.0
            elif name_lower.startswith(clean_q):
                score = 0.8
            else:
                score = 0.5

            matches.append({
                "id": node.get("id", str(node.element_id)),
                "type": m_type,
                "name": name,
                "file_path": f_path,
                "line": line,
                "match_snippet": node.get("signature") or node.get("docstring") or name,
                "score": score,
            })

    return sorted(matches, key=lambda x: x["score"], reverse=True)


async def query_repo_files(
    driver: AsyncDriver,
    repo_id: str,
    database: str | None = None,
) -> list[dict[str, Any]]:
    """List all indexed files and their defined symbols from Neo4j."""
    repo_ids = get_candidate_repo_ids(repo_id)
    kwargs = {"database": database} if database else {}

    files_query = """
    MATCH (f:File)
    WHERE f.repo_id IN $repo_ids
    OPTIONAL MATCH (f)-[:DEFINES]->(s)
    RETURN f, collect(s.name) AS symbols
    ORDER BY f.path ASC
    """

    results = []
    async with driver.session(**kwargs) as session:
        res = await session.run(files_query, {"repo_ids": repo_ids})
        async for rec in res:
            f = rec["f"]
            symbols = [s for s in rec["symbols"] if s]
            results.append({
                "path": f.get("path", ""),
                "content": "",
                "language": f.get("language", "Unknown"),
                "lines": f.get("lines", 0),
                "analyzed": True,
                "symbols": symbols,
                "size_bytes": f.get("size_bytes", 0),
            })

    return results
