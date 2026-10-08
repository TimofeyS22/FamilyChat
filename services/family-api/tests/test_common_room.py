from conftest import create_user

from app.models.family_room import FamilyRoom
from app.services.common_room_service import CommonRoomService


def test_reconcile_common_room_joins_active_users_only(db_session, fake_matrix):
    active = create_user(
        db_session,
        username="active",
        display_name="Active",
        family_code="ACT-1001",
    )
    inactive = create_user(
        db_session,
        username="inactive",
        display_name="Inactive",
        family_code="INA-1001",
        is_active=False,
    )

    result = CommonRoomService(matrix_admin=fake_matrix).reconcile_active_users(db_session)
    db_session.commit()

    assert result.room_id == "!room-1:familychat.local"
    assert result.joined == [active.matrix_user_id]
    assert result.failed == []
    assert fake_matrix.created_rooms == [
        {
            "encrypted": False,
            "matrix_room_id": "!room-1:familychat.local",
            "name": "Family Chat",
        }
    ]
    assert fake_matrix.room_memberships["!room-1:familychat.local"] == {active.matrix_user_id}
    assert inactive.matrix_user_id not in fake_matrix.room_memberships["!room-1:familychat.local"]


def test_reconcile_common_room_skips_existing_members(db_session, fake_matrix):
    active = create_user(
        db_session,
        username="active",
        display_name="Active",
        family_code="ACT-1001",
    )
    room = FamilyRoom(
        kind="common",
        name="Family Chat",
        matrix_room_id="!existing:familychat.local",
    )
    db_session.add(room)
    db_session.commit()
    fake_matrix.room_memberships["!existing:familychat.local"] = {active.matrix_user_id}

    result = CommonRoomService(matrix_admin=fake_matrix).reconcile_active_users(db_session)
    db_session.commit()

    assert result.joined == []
    assert result.already_joined == [active.matrix_user_id]
    assert fake_matrix.joined_rooms == []


def test_reconcile_common_room_reports_join_failures(db_session, fake_matrix):
    active = create_user(
        db_session,
        username="active",
        display_name="Active",
        family_code="ACT-1001",
    )
    fake_matrix.fail_join_room = True

    result = CommonRoomService(matrix_admin=fake_matrix).reconcile_active_users(db_session)
    db_session.commit()

    assert result.joined == []
    assert result.failed == [active.matrix_user_id]
