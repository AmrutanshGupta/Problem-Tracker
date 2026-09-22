from cachetools import TTLCache
from typing import Optional, Any
import json

class CacheService:
    def __init__(self):
        # 100 items, expires in 300 seconds
        self._cache = TTLCache(maxsize=100, ttl=300)
        
    def get(self, key: str) -> Optional[Any]:
        return self._cache.get(key)
        
    def set(self, key: str, value: Any):
        self._cache[key] = value
        
    def delete(self, key: str):
        if key in self._cache:
            del self._cache[key]

# Singleton instance
cache = CacheService()

