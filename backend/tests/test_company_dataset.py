import pytest
from backend.database import Base, engine, SessionLocal
from backend.models import Problem, CompanyMetadata
from backend.seed import apply_company_dataset, load_company_dataset


@pytest.fixture()
def db():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    session = SessionLocal()
    yield session
    session.rollback()
    session.close()


TINY = {
    "problems": {"two-sum": ["Two Sum", "Easy"], "lru-cache": ["LRU Cache", "Medium"]},
    "companies": {"Google": ["two-sum", "lru-cache"], "Acme": ["lru-cache"]},
}


def test_bundled_dataset_is_present_and_rich():
    data = load_company_dataset()
    assert data is not None
    assert len(data["companies"]) >= 80
    assert len(data["companies"]["Google"]) > 500
    assert "Meta" in data["companies"] and "TCS Digital" in data["companies"]
    # every referenced slug has metadata
    for slugs in data["companies"].values():
        for s in slugs:
            assert s in data["problems"]


def test_inserts_tags_and_is_idempotent(db):
    db.add(Problem(id="two-sum", title="Two Sum", url="u", difficulty="Easy", topics="Arrays", companies="Amazon"))
    db.add(CompanyMetadata(name="Google", focus_note="keep me"))
    db.commit()

    inserted, tagged, added = apply_company_dataset(db, TINY)
    assert (inserted, tagged, added) == (1, 1, 1)  # lru-cache new, two-sum re-tagged, Acme new

    two_sum = db.query(Problem).filter_by(id="two-sum").one()
    assert set(two_sum.companies.split(",")) == {"Amazon", "Google"}  # existing tag preserved
    lru = db.query(Problem).filter_by(id="lru-cache").one()
    assert set(lru.companies.split(",")) == {"Google", "Acme"}
    assert lru.topics == "Linked List"
    assert db.query(CompanyMetadata).filter_by(name="Google").one().focus_note == "keep me"

    assert apply_company_dataset(db, TINY) == (0, 0, 0)


def test_full_bundled_dataset_applies_and_serves_company_queries(db):
    inserted, _tagged, added = apply_company_dataset(db)
    assert inserted > 2000 and added >= 80
    google = db.query(Problem).filter(Problem.companies.like("%Google%")).count()
    assert google > 500
    assert apply_company_dataset(db) == (0, 0, 0)
