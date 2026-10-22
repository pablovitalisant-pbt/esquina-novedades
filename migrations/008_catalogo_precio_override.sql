CREATE TABLE IF NOT EXISTS catalogo_precio_override (
  id SERIAL PRIMARY KEY,
  catalogo_id INTEGER NOT NULL REFERENCES catalogos(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  precio NUMERIC NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(catalogo_id, codigo)
);
