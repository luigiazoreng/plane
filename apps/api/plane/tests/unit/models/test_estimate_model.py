# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.db.models.estimate import EstimateType


@pytest.mark.unit
class TestEstimateType:
    def test_time_estimate_type_is_available(self):
        assert EstimateType.TIME == "time"
        assert ("time", "Time") in EstimateType.choices
