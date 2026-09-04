"""Arena service errors.

The distinction that matters most here is between "Arena answered, and nothing
matched" and "Arena did not answer". CLAUDE.md 4.5 requires the second never to
be presented to a user as the first, so a failure is always an exception and an
empty result is always an empty list.
"""


class ArenaError(Exception):
    """Base class for every Arena failure."""


class ArenaConfigError(ArenaError):
    """Configuration is missing, blank, or internally inconsistent.

    Raised at load time rather than at call time so the application refuses to
    start on an unverified config instead of guessing an endpoint or an
    attribute name.
    """


class ArenaAuthError(ArenaError):
    """Authentication or session establishment failed."""


class ArenaTransportError(ArenaError):
    """Arena was unreachable, timed out, or returned an unusable response.

    Never catch this and return an empty result set.
    """


class ArenaNotFoundError(ArenaError):
    """Arena reports that the requested object does not exist."""


class ItemNotReleasedError(ArenaError):
    """The item exists but its lifecycle state is not a released state.

    Raised when a caller asks for a released document for an item that has not
    been released. The standard item route must never serve one (CLAUDE.md 4.8).
    """

    def __init__(self, item_number: str, lifecycle_state: str):
        self.item_number = item_number
        self.lifecycle_state = lifecycle_state
        super().__init__(
            f"Item {item_number} is in lifecycle state "
            f"{lifecycle_state!r}, which is not configured as released"
        )


class NoReleasedPdfError(ArenaError):
    """A released item carries no usable released PDF.

    This is a data fault to report, not a reason to substitute a drawing from
    somewhere else (CLAUDE.md 4.8).
    """


class AmbiguousPdfError(ArenaError):
    """A released item carries several PDFs and no rule to choose between them.

    Left unresolved in CLAUDE.md Open Decisions. Reporting the ambiguity is
    correct; picking one is not.
    """

    def __init__(self, item_number: str, candidates: list[str]):
        self.item_number = item_number
        self.candidates = candidates
        super().__init__(
            f"Item {item_number} has {len(candidates)} candidate PDFs and no "
            f"configured rule to choose between them: {', '.join(candidates)}. "
            f"Set files.drawing_category in the Arena config."
        )


class UnitMismatchError(ArenaError):
    """A dimensional value was supplied in a different unit than configured.

    Units are never assumed or silently converted (CLAUDE.md Units).
    """

    def __init__(self, parameter: str, given: str, expected: str):
        self.parameter = parameter
        self.given = given
        self.expected = expected
        super().__init__(
            f"Parameter {parameter!r} was given in {given!r} but Arena holds it "
            f"in {expected!r}. Supply the value in {expected!r}; this service "
            f"does not convert units."
        )


class UnknownParameterError(ArenaError):
    """A search used a parameter with no configured Arena attribute.

    A parameter Arena cannot search on must not be offered as a dropdown
    (CLAUDE.md 4.3).
    """
