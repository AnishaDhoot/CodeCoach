"""Alembic environment.

Resolves the target database from the app's own configuration (backend.database),
so `alembic upgrade head` always talks to the same DB as the running service.
Importing backend.models populates Base.metadata for autogenerate.
"""
from logging.config import fileConfig

from alembic import context

# Import the app's engine/Base and ensure every model is registered on the metadata.
from backend.database import engine, Base
import backend.models  # noqa: F401  (registers all tables on Base.metadata)

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=str(engine.url),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=engine.url.get_backend_name() == "sqlite",
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            # Batch mode makes ALTER TABLE work on SQLite (dev); harmless on Postgres.
            render_as_batch=connection.dialect.name == "sqlite",
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
