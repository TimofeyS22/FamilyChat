class FamilyAPIError(Exception):
    """Base exception for expected application errors."""


class InvalidInviteError(FamilyAPIError):
    pass


class DuplicateUsernameError(FamilyAPIError):
    pass


class MatrixUserConflictError(FamilyAPIError):
    pass


class MatrixAdminError(FamilyAPIError):
    pass


class RateLimitExceededError(FamilyAPIError):
    pass


class AdminBootstrapError(FamilyAPIError):
    pass
