# Script to generate lightweight, pre-projected 3D map data for web application
suppressPackageStartupMessages({
  library(sf)
  library(dplyr)
  library(readr)
  library(stringr)
  library(jsonlite)
})

cat("=== 1. Loading and Merging Data ===\n")
cnts <- st_read("3d choropleth  population map/National Sub-State Geography.gpkg", layer = "County", quiet = TRUE)
chronic <- read_csv("3d choropleth  population map/Complete_Merged_DiabetesAtlas_CountyData.csv", show_col_types = FALSE) %>%
  mutate(CountyFIPS = str_pad(as.character(CountyFIPS), 5, "left", "0"))

m <- cnts %>%
  mutate(GEOID = as.character(GEOID)) %>%
  left_join(chronic, by = c("GEOID" = "CountyFIPS")) %>%
  filter(!str_sub(GEOID, 1, 2) %in% c("02", "15", "72", "66", "60", "69", "78"))

cat("Total contiguous counties:", nrow(m), "\n")

cat("=== 2. Projecting to US Albers (EPSG:5070) & Simplifying ===\n")
# EPSG:5070 is NAD83 / Conus Albers (standard for contiguous US)
m_proj <- st_transform(m, 5070)
# Simplify with 10km tolerance for clean, crisp polygon outlines and lightweight payload
m_simp <- st_simplify(m_proj, preserveTopology = TRUE, dTolerance = 11000)

bbox <- st_bbox(m_simp)
cx <- (bbox[["xmin"]] + bbox[["xmax"]]) / 2
cy <- (bbox[["ymin"]] + bbox[["ymax"]]) / 2
span_x <- bbox[["xmax"]] - bbox[["xmin"]]

# Target width 100 Three.js units, centered at 0, 0
scale_factor <- 100 / span_x

cat("=== 3. Extracting Polygons and Attributes ===\n")
counties_list <- list()

for (i in seq_len(nrow(m_simp))) {
  row <- m_simp[i, ]
  fips <- row$GEOID
  county_name <- row$County
  state_name <- row$State
  rate <- as.numeric(row$Percentage)
  if (is.na(rate)) rate <- 8.3
  
  geom <- st_geometry(row)[[1]]
  geom_type <- class(geom)[2]
  
  poly_coords <- list()
  
  extract_ring <- function(mat) {
    # Center and scale: X -> right, Y -> up in 2D (becomes -Z in Three.js plane)
    x <- round((mat[, 1] - cx) * scale_factor, 2)
    y <- round((mat[, 2] - cy) * scale_factor, 2)
    # Deduplicate consecutive points
    keep <- c(TRUE, (diff(x) != 0 | diff(y) != 0))
    cbind(x[keep], y[keep])
  }
  
  if (geom_type == "POLYGON") {
    # First ring is exterior
    exterior <- extract_ring(geom[[1]])
    if (nrow(exterior) >= 3) {
      poly_coords[[length(poly_coords) + 1]] <- exterior
    }
  } else if (geom_type == "MULTIPOLYGON") {
    for (p in seq_along(geom)) {
      exterior <- extract_ring(geom[[p]][[1]])
      if (nrow(exterior) >= 3) {
        poly_coords[[length(poly_coords) + 1]] <- exterior
      }
    }
  }
  
  if (length(poly_coords) > 0) {
    counties_list[[length(counties_list) + 1]] <- list(
      id = fips,
      name = county_name,
      state = state_name,
      rate = rate,
      polys = poly_coords
    )
  }
}

cat("Processed", length(counties_list), "counties.\n")

target_dir <- "data"
if (!dir.exists(target_dir)) dir.create(target_dir, recursive = TRUE)

out_file <- file.path(target_dir, "us_counties_diabetes.json")

output_data <- list(
  meta = list(
    title = "U.S. County Diabetes Prevalence (Contiguous)",
    source = "CDC Diabetes Atlas 2021 & US Census Bureau",
    author = "Kent John Macalam",
    units = "Percentage (%)",
    countyCount = length(counties_list),
    minRate = min(sapply(counties_list, function(x) x$rate)),
    maxRate = max(sapply(counties_list, function(x) x$rate)),
    medianRate = median(sapply(counties_list, function(x) x$rate))
  ),
  counties = counties_list
)

write_json(output_data, out_file, auto_unbox = TRUE, digits = 2)

cat("Successfully generated:", out_file, "\n")
cat("File size:", round(file.info(out_file)$size / 1024, 1), "KB\n")
