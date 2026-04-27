"""数据库连接抽象层 + DB key/path 规范化 (D-084).

单一连接工厂. 所有 service / migrations 通过 get_connection() 取连接,
不再 from shortvideo.config import DB_PATH 然后 sqlite3.connect(DB_PATH).

路线 B 切 Postgres 第一步钩子: 改本模块 get_connection() 返回 psycopg2/asyncpg.
仍需逐表逐 query 适配 SQL 方言 7 项:
  1. 主键: INTEGER PRIMARY KEY AUTOINCREMENT → SERIAL / GENERATED ALWAYS AS IDENTITY
  2. 时间: strftime('%s','now') → EXTRACT(EPOCH FROM NOW())::BIGINT
  3. 冲突插入: INSERT OR IGNORE → INSERT ... ON CONFLICT DO NOTHING
  4. 元信息: PRAGMA table_info(t) → SELECT column_name FROM information_schema.columns
  5. row factory: sqlite3.Row → psycopg2 RealDictCursor / asyncpg Record
  6. 占位符: ? → %s (psycopg2) 或 $1 $2 (asyncpg)
  7. lastrowid: 改用 RETURNING id

预估切 Postgres 工作量: 1-2 天 (连接工厂改一处 + dialect 适配多处).
"""
from __future__ import annotations

import sqlite3
from pathlib import Path

import shortvideo.config


def current_db_path() -> Path:
    """规范化后的 DB 路径. 单一规范化点.

    处理:
    - `~` 展开 (expanduser)
    - 相对路径 → 绝对路径 (resolve)
    - symlink 解析 (resolve)
    - macOS 大小写规范化 (resolve)

    被 get_connection() 和 current_db_key() 共用, 保证 key 与实际连接路径一致.
    """
    return Path(shortvideo.config.DB_PATH).expanduser().resolve()


def get_connection() -> sqlite3.Connection:
    """单一连接工厂. 用规范化路径连接, 避免 ~/相对路径/symlink 打开错文件.

    调用方如需 row_factory (字典式 row 访问), 自己设置:
        conn = get_connection()
        conn.row_factory = sqlite3.Row
    例: shortvideo/works.py 的 _conn() 包装就是这么做的.
    """
    return sqlite3.connect(str(current_db_path()))


def current_db_key() -> str:
    """规范化字符串 key, 用于 migrations._applied_db_key 跟踪.

    与 get_connection() 共用 current_db_path(), 保证 key 与实际连接路径一致.
    """
    return str(current_db_path())
