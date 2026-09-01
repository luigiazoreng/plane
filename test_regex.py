import re

def _extract_header(headers_str: str, header_name: str):
    pattern = re.compile(rf"^{header_name}:\s*(.*?)$", re.IGNORECASE | re.MULTILINE)
    match = pattern.search(headers_str)
    if match:
        val = match.group(1).strip()
        if val.startswith("<") and val.endswith(">"):
            return val
        return val
    return None

print(repr(_extract_header("In-Reply-To: <123>\n", "In-Reply-To")))
print(repr(_extract_header("In-Reply-To: <123>\r\n", "In-Reply-To")))
print(repr(_extract_header("References: <123>\r\n <456>\r\n", "References")))
