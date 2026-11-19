-- Docão Fazendão: tabelas próprias (prefixo farm_) no MESMO D1 docao-contas do Shooter.
-- Só lê accounts/sessions do Shooter (login compartilhado); não altera nenhuma tabela existente.
CREATE TABLE IF NOT EXISTS farm_players (
  account_id INTEGER PRIMARY KEY,          -- = accounts.id do Shooter
  nick TEXT NOT NULL,
  state TEXT NOT NULL,                     -- fazenda inteira em JSON (prédios, canteiros, exército, filas)
  version INTEGER NOT NULL DEFAULT 0,      -- lock otimista
  wtok TEXT NOT NULL DEFAULT '',           -- token da última escrita (escrita dupla atômica no roubo)
  level INTEGER NOT NULL DEFAULT 1,        -- nível do Celeiro (busca de alvo)
  trophies INTEGER NOT NULL DEFAULT 0,     -- Medalhas de Lama
  shield_until INTEGER NOT NULL DEFAULT 0, -- ms
  lock_until INTEGER NOT NULL DEFAULT 0,   -- ms: alguém está atacando
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_farm_players_trophies ON farm_players(trophies);
CREATE INDEX IF NOT EXISTS idx_farm_players_updated ON farm_players(updated_at);
CREATE TABLE IF NOT EXISTS farm_attacks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  attacker INTEGER NOT NULL,
  defender INTEGER NOT NULL DEFAULT 0,     -- 0 = base de bot
  target TEXT NOT NULL,                    -- nome mostrado
  seed INTEGER NOT NULL,
  snapshot TEXT NOT NULL,                  -- { base, loot, trophies, level }
  army TEXT NOT NULL,                      -- exército levado
  status TEXT NOT NULL DEFAULT 'open',     -- open | resolving | done | abandoned
  cmds TEXT,                               -- [{t,u,x,y}] pro replay
  result TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_farm_attacks_attacker ON farm_attacks(attacker, created_at);
CREATE INDEX IF NOT EXISTS idx_farm_attacks_defender ON farm_attacks(defender, created_at);
CREATE TABLE IF NOT EXISTS farm_wall (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner INTEGER NOT NULL,
  actor TEXT NOT NULL,
  kind TEXT NOT NULL,                      -- steal | bite | attack
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_farm_wall_owner ON farm_wall(owner, created_at);
