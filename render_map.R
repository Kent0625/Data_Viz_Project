# Render Script for US Diabetes Choropleth Map
suppressPackageStartupMessages({
  library(sf)
  library(dplyr)
  library(ggplot2)
  library(readr)
  library(stringr)
  library(rayshader)
  library(rgl)
})

cat("=== 1. Loading and Merging Data ===\n")
chronic_data <- read_csv("3d choropleth  population map/Complete_Merged_DiabetesAtlas_CountyData.csv", show_col_types = FALSE)
us_gpkg_path <- "3d choropleth  population map/National Sub-State Geography.gpkg"

us_boundaries <- st_read(us_gpkg_path, layer = "County", quiet = TRUE)
us_boundaries <- us_boundaries %>% mutate(GEOID = as.character(GEOID))

chronic_data <- chronic_data %>%
  mutate(CountyFIPS = str_pad(as.character(CountyFIPS), width = 5, side = "left", pad = "0")) %>%
  mutate(CountyFIPS = str_trim(CountyFIPS))

merged_data <- us_boundaries %>%
  left_join(chronic_data, by = c("GEOID" = "CountyFIPS")) %>%
  filter(!str_sub(GEOID, 1, 2) %in% c("02", "15", "72", "66", "60", "69", "78"))

cat("Total contiguous counties:", nrow(merged_data), "\n")

cat("=== 2. Creating 2D Diabetes Map ===\n")
# Clinical Blood-Glucose & Health Alert Color Scale:
# Sequential gradient: soft pale rose (low prevalence) -> vibrant blood red -> deep crimson maroon (peak epidemic clusters)
diabetes_colors <- c("#FFF5F0", "#FEE0D2", "#FC9272", "#EF3B2C", "#CB181D", "#99000D", "#5A0009")

diabetes_map <- ggplot(merged_data) +
  geom_sf(aes(fill = as.numeric(Percentage)), color = NA) +
  scale_fill_gradientn(
    colors = diabetes_colors,
    name = "Diabetes (%)",
    na.value = "grey80",
    breaks = seq(6, 18, 3),
    labels = paste0(seq(6, 18, 3), "%")
  ) +
  theme_minimal(base_size = 14) +
  labs(
    title = "Diabetes Distribution in the U.S.: A County-Level Analysis",
    subtitle = "Adult Diabetes Prevalence (Ages 20+) Across Contiguous U.S. Counties",
    caption = "Source: CDC Diabetes Atlas 2021 | Visualization by Kent John Macalam"
  ) +
  theme(
    plot.title = element_text(face = "bold", size = 18, color = "#67000D", hjust = 0.5),
    plot.subtitle = element_text(size = 13, color = "#444444", hjust = 0.5, margin = margin(b = 15)),
    plot.caption = element_text(size = 10, color = "#666666", hjust = 0.95),
    legend.position = "right",
    legend.title = element_text(face = "bold", size = 11),
    panel.background = element_rect(fill = "white", color = NA),
    plot.background = element_rect(fill = "white", color = NA)
  )

# Save high-res 2D map
out_2d <- "diabetes_2d_map.png"
ggsave(out_2d, plot = diabetes_map, width = 14, height = 8, dpi = 300)
cat("2D Map saved to:", out_2d, "\n")

cat("=== 3. Rendering 3D Rayshader Map ===\n")
# Set rgl options for headless/offscreen rendering if needed
options(rgl.useNULL = FALSE)

tryCatch({
  plot_gg(
    diabetes_map,
    multicore = FALSE,
    width = 9,
    height = 6,
    scale = 160,
    shadow = TRUE,
    shadow_intensity = 0.6,
    sunangle = 125,
    windowsize = c(1600, 1000),
    zoom = 0.54,
    phi = 35.6,
    theta = -53.6,
    background = "white",
    shadowcolor = "gray30",
    solid = FALSE
  )
  
  cat("Capturing 3D snapshot...\n")
  render_snapshot(filename = "USA_diabetes_3d_snapshot.png", clear = FALSE)
  cat("3D Snapshot saved to: USA_diabetes_3d_snapshot.png\n")
  
  cat("Running high-quality raytracing render (fast preview samples = 48)...\n")
  render_highquality(
    filename = "USA_diabetes_3d_map.png",
    samples = 48,
    width = 1600,
    height = 1200,
    parallel = TRUE
  )
  cat("3D High-quality render saved to: USA_diabetes_3d_map.png\n")
  
  rgl::close3d()
}, error = function(e) {
  cat("3D render notice:", conditionMessage(e), "\n")
  cat("If OpenGL window is restricted in background terminal, 2D render is fully available.\n")
})

cat("Rendering pipeline finished!\n")
