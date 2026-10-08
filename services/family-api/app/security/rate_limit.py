from collections import defaultdict, deque
from time import monotonic

from app.core.errors import RateLimitExceededError


class InMemoryRateLimiter:
    def __init__(self, window_seconds: int) -> None:
        self.window_seconds = window_seconds
        self._attempts: dict[str, deque[float]] = defaultdict(deque)

    def check(self, key: str, limit: int) -> None:
        now = monotonic()
        attempts = self._attempts[key]
        while attempts and attempts[0] <= now - self.window_seconds:
            attempts.popleft()
        if len(attempts) >= limit:
            raise RateLimitExceededError
        attempts.append(now)

    def reset(self) -> None:
        self._attempts.clear()
