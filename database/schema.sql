CREATE DATABASE IF NOT EXISTS transporte
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE transporte;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  phone VARCHAR(40),
  role ENUM('carrier', 'shipper') NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trucks (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  plate VARCHAR(20) NOT NULL UNIQUE,
  truck_type VARCHAR(80) NOT NULL,
  max_payload_tons DECIMAL(8,2) NOT NULL,
  fuel_consumption_l_per_100km DECIMAL(6,2) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_trucks_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT chk_truck_payload CHECK (max_payload_tons > 0),
  CONSTRAINT chk_truck_consumption CHECK (fuel_consumption_l_per_100km > 0)
);

CREATE TABLE IF NOT EXISTS routes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  origin VARCHAR(100) NOT NULL,
  destination VARCHAR(100) NOT NULL,
  distance_km DECIMAL(8,2) NOT NULL,
  diesel_cost_base_bob DECIMAL(12,2) NULL,
  tolls_bob DECIMAL(12,2) NULL,
  tolls_verified_at DATE NULL,
  data_status ENUM('estimated', 'verified') NOT NULL DEFAULT 'estimated',
  notes VARCHAR(500),
  UNIQUE KEY uq_route_direction (origin, destination),
  CONSTRAINT chk_route_distance CHECK (distance_km > 0),
  CONSTRAINT chk_verified_tolls CHECK (
    (tolls_bob IS NULL AND tolls_verified_at IS NULL)
    OR (tolls_bob IS NOT NULL AND tolls_verified_at IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS loads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  shipper_id BIGINT UNSIGNED NOT NULL,
  origin VARCHAR(100) NOT NULL,
  destination VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL,
  weight_tons DECIMAL(8,2) NOT NULL,
  offered_price_bob DECIMAL(12,2),
  status ENUM('available', 'assigned', 'completed', 'cancelled') NOT NULL DEFAULT 'available',
  pickup_at DATETIME,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_load_route_status (origin, destination, status),
  CONSTRAINT fk_loads_shipper FOREIGN KEY (shipper_id) REFERENCES users(id),
  CONSTRAINT chk_load_weight CHECK (weight_tons > 0)
);

CREATE TABLE IF NOT EXISTS route_alerts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  route_id BIGINT UNSIGNED NOT NULL,
  alert_type ENUM('block', 'restriction', 'weather', 'information') NOT NULL,
  message VARCHAR(1000) NOT NULL,
  source VARCHAR(250),
  observed_at DATETIME NOT NULL,
  expires_at DATETIME,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_alert_active (active, expires_at),
  CONSTRAINT fk_alerts_route FOREIGN KEY (route_id) REFERENCES routes(id)
);

CREATE TABLE IF NOT EXISTS route_reports (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  route_id BIGINT UNSIGNED NOT NULL,
  message VARCHAR(1000) NOT NULL,
  status ENUM('pending_review', 'reviewed', 'rejected') NOT NULL DEFAULT 'pending_review',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_route_reports_status_created (status, created_at),
  CONSTRAINT fk_route_reports_route FOREIGN KEY (route_id) REFERENCES routes(id)
);

-- Distancias preliminares para demostración, no son mediciones ni garantía de ruta.
-- Los peajes oficiales (Vías Bolivia) y costos de diésel quedan NULL hasta validarlos
-- con el informe del proyecto y una fuente vigente.
INSERT INTO routes
  (origin, destination, distance_km, diesel_cost_base_bob, tolls_bob, data_status, notes)
VALUES
  ('Cochabamba', 'Oruro', 214.00, NULL, NULL, 'estimated', 'Distancia referencial; validar trazado y peajes.'),
  ('Oruro', 'Cochabamba', 214.00, NULL, NULL, 'estimated', 'Distancia referencial; validar trazado y peajes.'),
  ('Oruro', 'La Paz', 230.00, NULL, NULL, 'estimated', 'Vía Patacamaya; distancia referencial.'),
  ('La Paz', 'Oruro', 230.00, NULL, NULL, 'estimated', 'Vía Patacamaya; distancia referencial.'),
  ('Cochabamba', 'La Paz', 444.00, NULL, NULL, 'estimated', 'Suma referencial vía Oruro y Patacamaya.'),
  ('La Paz', 'Cochabamba', 444.00, NULL, NULL, 'estimated', 'Suma referencial vía Oruro y Patacamaya.'),
  ('Oruro', 'Patacamaya', 115.00, NULL, NULL, 'estimated', 'Conexión referencial del eje troncal.'),
  ('Patacamaya', 'Oruro', 115.00, NULL, NULL, 'estimated', 'Conexión referencial del eje troncal.'),
  ('Patacamaya', 'La Paz', 115.00, NULL, NULL, 'estimated', 'Conexión referencial del eje troncal.'),
  ('La Paz', 'Patacamaya', 115.00, NULL, NULL, 'estimated', 'Conexión referencial del eje troncal.')
ON DUPLICATE KEY UPDATE
  distance_km = VALUES(distance_km),
  notes = VALUES(notes);
