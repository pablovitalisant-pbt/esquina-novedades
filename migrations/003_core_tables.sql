-- 003: Tablas base del sistema (extraídas de seed.ts)
-- DDL que antes vivía en scripts/seed.ts como DROP+CREATE.
-- Cada CREATE usa IF NOT EXISTS para ser idempotente.
-- Ordenado por dependencias: empresas/usuarios primero, luego tablas con FKs.

-- Nivel 0: sin dependencias
CREATE TABLE IF NOT EXISTS empresas (
  id         SERIAL PRIMARY KEY,
  nombre     TEXT NOT NULL,
  slug       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id         SERIAL PRIMARY KEY,
  rut        TEXT UNIQUE NOT NULL,
  nombre     TEXT NOT NULL,
  rol        TEXT NOT NULL,
  password   TEXT NOT NULL,
  activo     BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Nivel 1: dependen de empresas y/o usuarios
CREATE TABLE IF NOT EXISTS usuario_empresa (
  usuario_id INTEGER REFERENCES usuarios(id),
  empresa_id INTEGER REFERENCES empresas(id),
  PRIMARY KEY (usuario_id, empresa_id)
);

CREATE TABLE IF NOT EXISTS productos (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER REFERENCES empresas(id),
  codigo        TEXT NOT NULL,
  nroingreso    TEXT,
  saldo         INTEGER DEFAULT 0,
  umed          TEXT,
  cif           DECIMAL(12,4),
  costo         DECIMAL(12,2),
  prcventa      DECIMAL(12,2),
  prcminimo     DECIMAL(12,2),
  cantcaja      INTEGER DEFAULT 1,
  pesocaja      DECIMAL(10,4) DEFAULT 0,
  cubicaja      DECIMAL(10,4) DEFAULT 0,
  detalle       TEXT,
  imagen_url    TEXT,
  es_nuevo      BOOLEAN DEFAULT FALSE,
  fecha_ingreso TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS ubicaciones_bodega (
  id            SERIAL PRIMARY KEY,
  empresa_id    INTEGER REFERENCES empresas(id),
  codigo        TEXT NOT NULL,
  ubicacion     TEXT NOT NULL,
  detalle       TEXT,
  cantcaja      INTEGER DEFAULT 1,
  saldo         INTEGER DEFAULT 0,
  saldocajas    DECIMAL(10,2),
  fisico        DECIMAL(10,2),
  diferencia    DECIMAL(10,2),
  observaciones TEXT,
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(empresa_id, codigo)
);

CREATE TABLE IF NOT EXISTS inventario_conteo (
  id            SERIAL PRIMARY KEY,
  ubicacion_id  INTEGER REFERENCES ubicaciones_bodega(id),
  empresa_id    INTEGER REFERENCES empresas(id),
  fisico        DECIMAL(10,2),
  diferencia    DECIMAL(10,2),
  observaciones TEXT,
  contado_por   INTEGER REFERENCES usuarios(id),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalogos (
  id          SERIAL PRIMARY KEY,
  empresa_id  INTEGER REFERENCES empresas(id),
  titulo      TEXT NOT NULL,
  slug        TEXT UNIQUE NOT NULL,
  descripcion TEXT,
  activo      BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalogo_items (
  id           SERIAL PRIMARY KEY,
  catalogo_id  INTEGER REFERENCES catalogos(id) ON DELETE CASCADE,
  producto_id  INTEGER REFERENCES productos(id),
  tipo         TEXT DEFAULT 'product',
  url_media    TEXT,
  orden        INTEGER DEFAULT 0,
  hide_price   BOOLEAN DEFAULT FALSE,
  nota_extra   TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS despachos (
  id              SERIAL PRIMARY KEY,
  empresa_id      INTEGER REFERENCES empresas(id),
  folio           TEXT,
  imagen_url      TEXT NOT NULL,
  public_id       TEXT,
  nombre_original TEXT,
  estado          TEXT DEFAULT 'ok',
  procesado_por   INTEGER REFERENCES usuarios(id),
  fecha_despacho  DATE DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
