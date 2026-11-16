from pathlib import Path


def resolve_within(root: Path, relative_path: str) -> Path:
    root_resolved = root.resolve()
    relative = Path(relative_path)
    if relative.is_absolute():
        raise ValueError("relative path must not be absolute")
    candidate = (root_resolved / relative).resolve()
    if not candidate.is_relative_to(root_resolved):
        raise ValueError("path escapes the storage root")
    return candidate
