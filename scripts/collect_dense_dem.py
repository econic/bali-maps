import urllib.request
import json
import time
import os

print("Starting Robust Dense Elevation Map Collection (1.1 km resolution, 0.01° grid step)...", flush=True)

# Bali Bounding Box
min_lat, max_lat = -8.85, -8.05
min_lon, max_lon = 114.45, 115.75
step = 0.01

lats = []
lat = min_lat
while lat <= max_lat + 1e-9:
    lats.append(round(lat, 3))
    lat += step

lons = []
lon = min_lon
while lon <= max_lon + 1e-9:
    lons.append(round(lon, 3))
    lon += step

coords = []
for lt in lats:
    for ln in lons:
        coords.append((lt, ln))

print(f"Generated {len(coords)} total high-resolution grid points.", flush=True)

elevations = []
batch_size = 100
total_batches = (len(coords) + batch_size - 1) // batch_size
print(f"Querying elevations in {total_batches} batches...", flush=True)

def fetch_elevations_with_retry(lat_str, lon_str, max_retries=5):
    delay = 10.0
    for attempt in range(max_retries):
        url = f"https://api.open-meteo.com/v1/elevation?latitude={lat_str}&longitude={lon_str}"
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        try:
            with urllib.request.urlopen(req, timeout=30) as response:
                return json.loads(response.read().decode()).get('elevation', [])
        except urllib.error.HTTPError as e:
            if e.code == 429:
                print(f"Received HTTP 429 (Rate Limit). Sleeping {delay}s (Attempt {attempt+1}/{max_retries})...", flush=True)
                time.sleep(delay)
                delay *= 2.0
            else:
                print(f"HTTP Error {e.code}: {e.reason}. Retrying...", flush=True)
                time.sleep(2.0)
        except Exception as e:
            print(f"Network error: {e}. Retrying...", flush=True)
            time.sleep(2.0)
    raise Exception("Failed to fetch elevations after multiple retries.")

for i in range(0, len(coords), batch_size):
    batch = coords[i:i+batch_size]
    lat_str = ','.join(str(c[0]) for c in batch)
    lon_str = ','.join(str(c[1]) for c in batch)
    
    if i % 1000 == 0 or i == 0:
        print(f"  - Progress: processing points {i} to {min(len(coords), i + batch_size)}...", flush=True)
        
    try:
        batch_elevs = fetch_elevations_with_retry(lat_str, lon_str)
        elevations.extend(batch_elevs)
    except Exception as e:
        print(f"Fatal error on batch starting at index {i}: {e}", flush=True)
        elevations.extend([0] * len(batch))
        
    # Polite sleep between successful calls to avoid triggering rate limiters
    time.sleep(0.8)

# Keep points where elevation > 0 (land points)
land_points = []
for coord, elev in zip(coords, elevations):
    if elev is not None and elev > 0:
        land_points.append({
            "lat": coord[0],
            "lon": coord[1],
            "elev": int(elev)
        })

print(f"Filtered out {len(coords) - len(land_points)} ocean nodes.", flush=True)
print(f"Retained {len(land_points)} dense land elevation coordinates.", flush=True)

# Write output JSON to src/data/bali-elevation-grid.json
os.makedirs("/home/econic/projects/bali-maps/src/data", exist_ok=True)
output_path = "/home/econic/projects/bali-maps/src/data/bali-elevation-grid.json"

with open(output_path, "w") as f:
    json.dump(land_points, f)

print(f"\nSUCCESS: Dense elevation grid generated! Saved {len(land_points)} nodes to {output_path}", flush=True)
