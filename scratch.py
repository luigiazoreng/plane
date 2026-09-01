import re
in_reply_to = "<a8e9ea79-8ce5-4553-8d46-6ec70785506e@support.growatt.app>"
references = "<d45dc678-5bea-4a1c-83ed-fb382eab7913@support.growatt.app> <a8e9ea79-8ce5-4553-8d46-6ec70785506e@support.growatt.app>"

ids = re.findall(r"<[^>]+>", in_reply_to)
print("in_reply_to ids:", ids)

all_ids = []
all_ids.extend(re.findall(r"<[^>]+>", in_reply_to))
all_ids.extend(re.findall(r"<[^>]+>", references))
print("all_ids:", all_ids)

for msg_id in all_ids:
    match = re.search(r"<([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})@", msg_id, re.IGNORECASE)
    if match:
        print("MATCHED UUID:", match.group(1))

