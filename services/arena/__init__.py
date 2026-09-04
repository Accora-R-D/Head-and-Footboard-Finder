"""Arena PLM integration.

Arena is the source of truth for released standard inventory items, their
searchable attributes, their revisions, and the released PDFs the UI serves
(CLAUDE.md Source-of-Truth Rules). All Arena access goes through this package.
"""

from .attachments import AttachmentService
from .client import ArenaClient, Credentials
from .config import ArenaConfig, AttributeSpec, load_config
from .errors import (
    AmbiguousPdfError,
    ArenaAuthError,
    ArenaConfigError,
    ArenaError,
    ArenaNotFoundError,
    ArenaTransportError,
    ItemNotReleasedError,
    NoReleasedPdfError,
    UnitMismatchError,
    UnknownParameterError,
)
from .items import ItemService
from .models import Attachment, Dimension, Item, ReleasedDocument, SearchResult
from .transport import FakeTransport, RequestsTransport, Response, Transport

__all__ = [
    "AmbiguousPdfError",
    "ArenaAuthError",
    "ArenaClient",
    "ArenaConfig",
    "ArenaConfigError",
    "ArenaError",
    "ArenaNotFoundError",
    "ArenaTransportError",
    "Attachment",
    "AttachmentService",
    "AttributeSpec",
    "Credentials",
    "Dimension",
    "FakeTransport",
    "Item",
    "ItemNotReleasedError",
    "ItemService",
    "NoReleasedPdfError",
    "ReleasedDocument",
    "RequestsTransport",
    "Response",
    "SearchResult",
    "Transport",
    "UnitMismatchError",
    "UnknownParameterError",
    "load_config",
]
