from app.cli import bootstrap_admin_user
from app.core.errors import AdminBootstrapError, DuplicateUsernameError
from app.models.user import UserRole


def test_bootstrap_admin_creates_first_admin(db_session, settings, fake_matrix):
    user = bootstrap_admin_user(
        db_session,
        settings=settings,
        matrix_admin=fake_matrix,
        username="familyadmin",
        display_name="Family Admin",
        password="secure-password",
    )
    db_session.commit()

    assert user.role == UserRole.admin
    assert user.username == "familyadmin"
    assert user.matrix_user_id == "@familyadmin:familychat.local"
    assert user.family_code.startswith("FAM-")
    assert fake_matrix.created_users[0]["username"] == "familyadmin"


def test_bootstrap_admin_refuses_second_admin(db_session, settings, fake_matrix, admin_user):
    del admin_user

    try:
        bootstrap_admin_user(
            db_session,
            settings=settings,
            matrix_admin=fake_matrix,
            username="anotheradmin",
            display_name="Another Admin",
            password="secure-password",
        )
    except AdminBootstrapError:
        return
    raise AssertionError("second admin bootstrap was allowed")


def test_bootstrap_admin_refuses_reserved_localpart(db_session, settings, fake_matrix):
    try:
        bootstrap_admin_user(
            db_session,
            settings=settings,
            matrix_admin=fake_matrix,
            username="root",
            display_name="Root",
            password="secure-password",
        )
    except DuplicateUsernameError:
        return
    raise AssertionError("reserved bootstrap localpart was allowed")
