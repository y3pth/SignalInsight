from pathlib import Path

from alembic.config import Config
from sqlalchemy import create_engine, inspect

from alembic import command

BACKEND_DIR = Path(__file__).resolve().parents[1]
ALEMBIC_INI = BACKEND_DIR / "alembic.ini"
SCRIPT_LOCATION = BACKEND_DIR / "alembic"

EXPECTED_TABLES = {
    "datasets",
    "dataset_variables",
    "dataset_channels",
    "analysis_runs",
    "analysis_run_channels",
    "model_fits",
    "evidence_items",
    "artifacts",
    "explanations",
    "simulation_configs",
}


def migration_config(tmp_path: Path) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option("script_location", str(SCRIPT_LOCATION))
    config.set_main_option(
        "sqlalchemy.url",
        f"sqlite:///{(tmp_path / 'signalinsight.db').as_posix()}",
    )
    return config


def test_fresh_database_migration(tmp_path: Path) -> None:
    config = migration_config(tmp_path)
    command.upgrade(config, "head")

    engine = create_engine(f"sqlite:///{(tmp_path / 'signalinsight.db').as_posix()}")
    tables = set(inspect(engine).get_table_names())
    engine.dispose()

    assert EXPECTED_TABLES <= tables


def test_upgrade_and_downgrade_round_trip(tmp_path: Path) -> None:
    config = migration_config(tmp_path)
    command.upgrade(config, "head")
    command.upgrade(config, "head")
    command.downgrade(config, "base")

    engine = create_engine(f"sqlite:///{(tmp_path / 'signalinsight.db').as_posix()}")
    tables = set(inspect(engine).get_table_names())
    engine.dispose()

    assert tables <= {"alembic_version"}
