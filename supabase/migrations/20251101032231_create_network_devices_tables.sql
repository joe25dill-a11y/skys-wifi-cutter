/*
  # Local Network Manager Database Schema

  1. New Tables
    - `devices`
      - `id` (uuid, primary key) - Unique identifier
      - `name` (text) - Device name/hostname
      - `ip_address` (text) - IP address
      - `mac_address` (text, unique) - MAC address (unique identifier)
      - `status` (text) - Device status: 'allowed' or 'blocked'
      - `last_seen` (timestamptz) - Last time device was seen online
      - `device_type` (text) - Device type (phone, laptop, etc.)
      - `created_at` (timestamptz) - Creation timestamp
      - `updated_at` (timestamptz) - Last update timestamp
    
    - `bandwidth_logs`
      - `id` (uuid, primary key) - Unique identifier
      - `device_mac` (text) - Reference to device MAC address
      - `timestamp` (timestamptz) - Log timestamp
      - `upload_mbps` (numeric) - Upload speed in Mbps
      - `download_mbps` (numeric) - Download speed in Mbps
      - `created_at` (timestamptz) - Creation timestamp
    
    - `auth_users`
      - `id` (uuid, primary key) - Unique identifier
      - `username` (text, unique) - Login username
      - `password_hash` (text) - Hashed password
      - `created_at` (timestamptz) - Creation timestamp

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated access
    - Seed with mock data for demonstration

  3. Important Notes
    - This is a MOCK/SIMULATION system for educational purposes
    - DO NOT use for real network manipulation without proper authorization
    - Only use on networks and devices you own and have permission to manage
*/

-- Create devices table
CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL DEFAULT '',
  ip_address text NOT NULL,
  mac_address text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'allowed' CHECK (status IN ('allowed', 'blocked')),
  last_seen timestamptz DEFAULT now(),
  device_type text DEFAULT 'unknown',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create bandwidth_logs table
CREATE TABLE IF NOT EXISTS bandwidth_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_mac text NOT NULL,
  timestamp timestamptz DEFAULT now(),
  upload_mbps numeric(10, 2) DEFAULT 0,
  download_mbps numeric(10, 2) DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create auth_users table for mock authentication
CREATE TABLE IF NOT EXISTS auth_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE bandwidth_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for devices table
CREATE POLICY "Allow read access to devices"
  ON devices FOR SELECT
  USING (true);

CREATE POLICY "Allow insert to devices"
  ON devices FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow update to devices"
  ON devices FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow delete from devices"
  ON devices FOR DELETE
  USING (true);

-- RLS Policies for bandwidth_logs table
CREATE POLICY "Allow read access to bandwidth logs"
  ON bandwidth_logs FOR SELECT
  USING (true);

CREATE POLICY "Allow insert to bandwidth logs"
  ON bandwidth_logs FOR INSERT
  WITH CHECK (true);

-- RLS Policies for auth_users table
CREATE POLICY "Allow read access to auth users"
  ON auth_users FOR SELECT
  USING (true);

-- Insert mock devices for demonstration
INSERT INTO devices (name, ip_address, mac_address, status, device_type, last_seen) VALUES
  ('Johns iPhone', '192.168.1.101', '00:1A:2B:3C:4D:5E', 'allowed', 'phone', now() - interval '2 minutes'),
  ('Living Room TV', '192.168.1.102', '00:1A:2B:3C:4D:5F', 'allowed', 'tv', now() - interval '5 minutes'),
  ('Work Laptop', '192.168.1.103', '00:1A:2B:3C:4D:60', 'allowed', 'laptop', now() - interval '1 minute'),
  ('Smart Speaker', '192.168.1.104', '00:1A:2B:3C:4D:61', 'blocked', 'iot', now() - interval '15 minutes'),
  ('Gaming Console', '192.168.1.105', '00:1A:2B:3C:4D:62', 'allowed', 'console', now() - interval '30 minutes'),
  ('Guest Phone', '192.168.1.106', '00:1A:2B:3C:4D:63', 'blocked', 'phone', now() - interval '1 hour')
ON CONFLICT (mac_address) DO NOTHING;

-- Insert mock bandwidth data
INSERT INTO bandwidth_logs (device_mac, timestamp, upload_mbps, download_mbps) VALUES
  ('00:1A:2B:3C:4D:5E', now() - interval '5 minutes', 2.5, 15.3),
  ('00:1A:2B:3C:4D:5E', now() - interval '10 minutes', 1.8, 12.7),
  ('00:1A:2B:3C:4D:5F', now() - interval '5 minutes', 0.5, 25.4),
  ('00:1A:2B:3C:4D:5F', now() - interval '10 minutes', 0.4, 28.1),
  ('00:1A:2B:3C:4D:60', now() - interval '5 minutes', 5.2, 8.3),
  ('00:1A:2B:3C:4D:60', now() - interval '10 minutes', 4.8, 7.9),
  ('00:1A:2B:3C:4D:62', now() - interval '5 minutes', 8.5, 45.2),
  ('00:1A:2B:3C:4D:62', now() - interval '10 minutes', 9.1, 42.8);

-- Insert mock user (username: admin, password: admin123)
-- Note: In production, use proper password hashing (bcrypt, argon2, etc.)
INSERT INTO auth_users (username, password_hash) VALUES
  ('admin', 'admin123')
ON CONFLICT (username) DO NOTHING;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_devices_mac ON devices(mac_address);
CREATE INDEX IF NOT EXISTS idx_devices_status ON devices(status);
CREATE INDEX IF NOT EXISTS idx_bandwidth_device_mac ON bandwidth_logs(device_mac);
CREATE INDEX IF NOT EXISTS idx_bandwidth_timestamp ON bandwidth_logs(timestamp DESC);