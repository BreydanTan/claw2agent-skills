# Google Maps API [L1]

Geocode addresses, search places, and calculate routes via Google Maps.

## Actions

### `geocode`
| Param | Req | Type |
|-------|-----|------|
| address | ✅ | string |

### `search_places`
| Param | Req | Type |
|-------|-----|------|
| query | ✅ | string |
| radius | ❌ | number |

### `get_directions`
| Param | Req | Type |
|-------|-----|------|
| origin | ✅ | string |
| destination | ✅ | string |
| mode | ❌ | string |

### `get_place_details`
| Param | Req | Type |
|-------|-----|------|
| placeId | ✅ | string |

## Testing

```bash
node --test skills/google-maps-api/__tests__/handler.test.js
```
