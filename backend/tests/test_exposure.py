"""The exposure rule, case by case, as written in docs/spec.md."""

from app.exposure import Exposure, part_exposure, toy_exposure

A, B, C = 1, 2, 3  # supplier ids
AFFECTED, POSSIBLY, NONE = Exposure.AFFECTED, Exposure.POSSIBLY_AFFECTED, Exposure.NO_FINDING


# --- one part ---


def test_part_with_no_implicated_supplier_has_no_finding():
    assert part_exposure({A, B}, implicated=set()) is NONE
    assert part_exposure({A, B}, implicated={C}) is NONE


def test_part_whose_only_supplier_is_implicated_is_affected():
    assert part_exposure({A}, implicated={A}) is AFFECTED


def test_part_with_one_of_two_suppliers_implicated_is_possibly_affected():
    assert part_exposure({A, B}, implicated={A}) is POSSIBLY


def test_part_with_every_supplier_implicated_is_affected():
    assert part_exposure({A, B}, implicated={A, B}) is AFFECTED
    assert part_exposure({A, B}, implicated={A, B, C}) is AFFECTED


def test_part_with_no_known_supplier_has_no_finding():
    assert part_exposure(set(), implicated={A}) is NONE
    assert part_exposure(set(), implicated=set()) is NONE


def test_two_factories_of_one_supplier_count_as_one_supplier():
    assert part_exposure([A, A], implicated={A}) is AFFECTED
    assert part_exposure([A, A, B], implicated={A}) is POSSIBLY


# --- one toy ---


def test_toy_with_no_findings_has_no_finding_and_no_part_touched():
    result = toy_exposure({10: {A}, 11: {B, C}}, implicated=set())
    assert result.exposure is NONE
    assert result.parts == {10: NONE, 11: NONE}
    assert result.parts_touched == 0


def test_toy_is_affected_when_one_part_is_affected():
    result = toy_exposure({10: {A}, 11: {B}, 12: {C}}, implicated={A})
    assert result.exposure is AFFECTED
    assert result.parts == {10: AFFECTED, 11: NONE, 12: NONE}
    assert result.parts_touched == 1


def test_toy_is_possibly_affected_when_its_worst_part_is_possibly_affected():
    result = toy_exposure({10: {A, B}, 11: {C}}, implicated={A})
    assert result.exposure is POSSIBLY
    assert result.parts_touched == 1


def test_affected_wins_over_possibly_affected():
    result = toy_exposure({10: {A, B}, 11: {A}, 12: {C}}, implicated={A})
    assert result.exposure is AFFECTED
    assert result.parts == {10: POSSIBLY, 11: AFFECTED, 12: NONE}
    assert result.parts_touched == 2


def test_toy_with_no_parts_has_no_finding():
    result = toy_exposure({}, implicated={A})
    assert result.exposure is NONE
    assert result.parts_touched == 0


def test_a_second_finding_can_turn_possibly_into_affected():
    parts = {10: {A, B}}
    assert toy_exposure(parts, implicated={A}).exposure is POSSIBLY
    assert toy_exposure(parts, implicated={A, B}).exposure is AFFECTED


def test_preview_is_the_same_call_with_one_more_supplier():
    parts = {10: {A}, 11: {B, C}}
    implicated = {B}
    now = toy_exposure(parts, implicated)
    if_flagged = toy_exposure(parts, implicated | {A})
    assert (now.exposure, if_flagged.exposure) == (POSSIBLY, AFFECTED)
    assert implicated == {B}  # the caller's set is not changed


def test_exposure_values_are_the_api_strings():
    assert [e.value for e in Exposure] == ["affected", "possibly_affected", "no_finding"]
