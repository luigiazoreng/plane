# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.conf import settings
from django.core.exceptions import RequestDataTooBig
from django.http import JsonResponse


class RequestBodySizeLimitMiddleware:
    """
    Middleware to catch RequestDataTooBig exceptions and return
    413 Request Entity Too Large instead of 400 Bad Request.

    Note that touching ``request.body`` here is what makes
    ``DATA_UPLOAD_MAX_MEMORY_SIZE`` apply to multipart requests at all: Django
    normally exempts them so that large uploads stream to temporary files
    instead of being held in memory. Routes listed in
    ``settings.BODY_SIZE_EXEMPT_PATHS`` opt out and get that streaming
    behaviour back -- they are then responsible for bounding their own body.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def _is_exempt(self, request):
        for prefix in getattr(settings, "BODY_SIZE_EXEMPT_PATHS", []):
            if request.path.startswith(prefix):
                return True
        return False

    def __call__(self, request):
        if self._is_exempt(request):
            return self.get_response(request)

        try:
            _ = request.body
        except RequestDataTooBig:
            return JsonResponse(
                {
                    "error": "REQUEST_BODY_TOO_LARGE",
                    "detail": "The size of the request body exceeds the maximum allowed size.",
                },
                status=413,
            )

        # If body size is OK, continue with the request
        return self.get_response(request)
