/*
  # Fix Security and RLS Policies

  1. Changes
    - Drop insecure RLS policies that use USING (true)
    - Create secure policies requiring authentication
    - Enable pgcrypto extension for password hashing
    - Update mock user with hashed password
    - Add foreign key constraints
    - Add additional security indexes

  2. Security
    - All policies now require proper authentication
    - Password properly hashed using crypt()
    - Foreign key constraints ensure data integrity
*/

-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop old insecure policies
DROP POLICY IF EXISTS "Allow read access to devices" ON devices;
DROP POLICY IF EXISTS "Allow insert to devices" ON devices;
DROP POLICY IF EXISTS "Allow update to devices" ON devices;
DROP POLICY IF EXISTS "Allow delete from devices" ON devices;
DROP POLICY IF EXISTS "Allow read access to bandwidth logs" ON bandwidth_logs;
DROP POLICY IF EXISTS "Allow insert to bandwidth logs" ON bandwidth_logs;
DROP POLICY IF EXISTS "Allow read access to auth users" ON auth_users;

-- Create secure RLS policies for devices table
-- Note: For a local network manager, we're using service_role authentication
-- In production with Supabase Auth, use auth.uid() instead

CREATE POLICY "Service role can read devices"
  ON devices FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert devices"
  ON devices FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update devices"
  ON devices FOR UPDATE
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role can delete devices"
  ON devices FOR DELETE
  TO service_role
  USING (true);

-- Secure RLS policies for bandwidth_logs table
CREATE POLICY "Service role can read bandwidth logs"
  ON bandwidth_logs FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert bandwidth logs"
  ON bandwidth_logs FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Secure RLS policies for auth_users table
CREATE POLICY "Service role can read auth users"
  ON auth_users FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can manage auth users"
  ON auth_users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Add foreign key constraint
ALTER TABLE bandwidth_logs
  DROP CONSTRAINT IF EXISTS fk_bandwidth_device;

ALTER TABLE bandwidth_logs
  ADD CONSTRAINT fk_bandwidth_device
  FOREIGN KEY (device_mac)
  REFERENCES devices(mac_address)
  ON DELETE CASCADE;

-- Update mock user with properly hashed password
-- Password: admin123 (bcrypt compatible)
UPDATE auth_users
SET password_hash = crypt('admin123', gen_salt('bf'))
WHERE username = 'admin';

-- Add validation constraints
ALTER TABLE devices
  ADD CONSTRAINT valid_status
  CHECK (status IN ('allowed', 'blocked'));

ALTER TABLE devices
  ADD CONSTRAINT valid_ip
  CHECK (ip_address ~ '^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$');

-- Add updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for devices table
DROP TRIGGER IF EXISTS update_devices_updated_at ON devices;
CREATE TRIGGER update_devices_updated_at
    BEFORE UPDATE ON devices
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add index for auth lookups
CREATE INDEX IF NOT EXISTS idx_auth_users_username ON auth_users(username);

-- Add comment for documentation
COMMENT ON TABLE devices IS 'Network devices detected and managed by the system';
COMMENT ON TABLE bandwidth_logs IS 'Historical bandwidth usage logs for network devices';
COMMENT ON TABLE auth_users IS 'Local authentication users (not Supabase Auth)';
