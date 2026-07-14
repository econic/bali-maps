import json
import os
import math

print("Starting Local High-Resolution Elevation Grid Generation (Bilinear Interpolation)...", flush=True)

# Grid bounds
min_lat, max_lat = -8.85, -8.05
min_lon, max_lon = 114.45, 115.75

# Read the existing 194-point weather data
input_path = "/home/econic/projects/bali-maps/src/data/bali-weather-data.json"
if not os.path.exists(input_path):
    print(f"Error: Base weather data not found at {input_path}")
    exit(1)

with open(input_path, "r") as f:
    weather_data = json.load(f)

# Initialize the regular 17x27 coarse grid of elevations
# Latitudes from -8.85 to -8.05 with step 0.05 (17 points)
# Longitudes from 114.45 to 115.75 with step 0.05 (27 points)
coarse_elevations = [[0 for _ in range(27)] for _ in range(17)]

for p in weather_data:
    lat_idx = int(round((p["lat"] - min_lat) / 0.05))
    lon_idx = int(round((p["lon"] - min_lon) / 0.05))
    if 0 <= lat_idx < 17 and 0 <= lon_idx < 27:
        coarse_elevations[lat_idx][lon_idx] = p["elevation"]

# Generate the dense 81x131 grid (step 0.01)
dense_step = 0.01
dense_land_points = []

lats = []
lat = min_lat
while lat <= max_lat + 1e-9:
    lats.append(round(lat, 3))
    lat += dense_step

lons = []
lon = min_lon
while lon <= max_lon + 1e-9:
    lons.append(round(lon, 3))
    lon += dense_step

for lt in lats:
    for ln in lons:
        # Calculate float indices in the 17x27 coarse grid
        lat_f = (lt - min_lat) / 0.05
        lon_f = (ln - min_lon) / 0.05
        
        # Surrounding integer coordinates
        lat_0 = int(math.floor(lat_f))
        lat_1 = min(16, lat_0 + 1)
        lon_0 = int(math.floor(lon_f))
        lon_1 = min(26, lon_0 + 1)
        
        # Interpolation factors
        t = lat_f - lat_0
        u = lon_f - lon_0
        
        # Bilinear interpolation of elevation
        e00 = coarse_elevations[lat_0][lon_0]
        e10 = coarse_elevations[lat_1][lon_0]
        e01 = coarse_elevations[lat_0][lon_1]
        e11 = coarse_elevations[lat_1][lon_1]
        
        elev = (1 - t) * (1 - u) * e00 + t * (1 - u) * e10 + (1 - t) * u * e01 + t * u * e11
        
        # Round elevation
        elev_int = int(round(elev))
        
        # If elevation is greater than 0, it is land!
        if elev_int > 0:
            dense_land_points.append({
                "lat": lt,
                "lon": ln,
                "elev": elev_int
            })

# Save results
output_path = "/home/econic/projects/bali-maps/src/data/bali-elevation-grid.json"
os.makedirs(os.path.dirname(output_path), exist_ok=True)

with open(output_path, "w") as f:
    json.dump(dense_land_points, f, indent=2)

print(f"\nSUCCESS: Generated {len(dense_land_points)} high-resolution land elevation points!", flush=True)
print(f"Wrote grid map to {output_path}", flush=True)
