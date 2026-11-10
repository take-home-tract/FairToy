from typing import Annotated

from fastapi import Path

# An id in a path. Anything else (text, zero, a number too large to be an id) is a 422.
RecordId = Annotated[int, Path(ge=1, le=2**31 - 1)]
