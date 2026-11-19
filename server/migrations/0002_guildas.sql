-- Docão Fazendão: guildas (até 3 membros). Só CREATE TABLE/INDEX novos com prefixo farm_; nada do Shooter é tocado.
CREATE TABLE IF NOT EXISTS farm_guilds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,           -- nome normalizado (minúsculo, sem acento): nome único
  emblem TEXT NOT NULL,                    -- emoji do brasão
  color TEXT NOT NULL,                     -- cor do brasão (#rrggbb da lista fixa)
  code TEXT NOT NULL UNIQUE,               -- código de convite (6 letras)
  leader INTEGER NOT NULL,                 -- account_id do líder
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS farm_guild_members (
  account_id INTEGER PRIMARY KEY,          -- PK = uma guilda por jogador
  guild_id INTEGER NOT NULL,
  joined_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_farm_guild_members_guild ON farm_guild_members(guild_id, joined_at);
CREATE TABLE IF NOT EXISTS farm_guild_requests (
  guild_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  nick TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (guild_id, account_id)
);
CREATE INDEX IF NOT EXISTS idx_farm_guild_requests_acct ON farm_guild_requests(account_id);
CREATE TABLE IF NOT EXISTS farm_guild_chat (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL DEFAULT 0,   -- 0 = aviso do sistema
  nick TEXT NOT NULL,
  kind TEXT NOT NULL,                      -- msg | sys
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_farm_guild_chat_guild ON farm_guild_chat(guild_id, id);
