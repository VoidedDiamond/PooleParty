#!/usr/bin/env python3
"""mkapk.py - package an Android app without the Android SDK.

Does the two jobs aapt2 normally does for this tiny launcher:
  * compiles AndroidManifest.xml to Android's binary XML format
  * writes resources.arsc for the drawables in res/drawable/ (app icon and TV banner)
then zips them with classes.dex into an unsigned, 4-byte-aligned APK (signing is done by Sign.java).

usage: mkapk.py AndroidManifest.xml res_dir classes.dex out.apk
"""
import os
import struct
import sys
import xml.etree.ElementTree as ET
import zipfile

ANDROID_NS = "http://schemas.android.com/apk/res/android"

# Public framework resource IDs (android.R.attr / android.R.style); these never change.
ATTR_IDS = {
    "theme": 0x01010000, "label": 0x01010001, "icon": 0x01010002, "name": 0x01010003,
    "enabled": 0x0101000E, "exported": 0x01010010, "taskAffinity": 0x01010012,
    "clearTaskOnLaunch": 0x01010015, "stateNotNeeded": 0x01010016, "excludeFromRecents": 0x01010017,
    "launchMode": 0x0101001D, "screenOrientation": 0x0101001E, "configChanges": 0x0101001F,
    "minSdkVersion": 0x0101020C, "versionCode": 0x0101021B, "versionName": 0x0101021C,
    "targetSdkVersion": 0x01010270, "allowBackup": 0x01010280, "required": 0x0101028E,
    "hardwareAccelerated": 0x010102D3, "largeHeap": 0x0101035A, "banner": 0x010103F2,
    "resumeWhilePausing": 0x010104B2, "requestLegacyExternalStorage": 0x01010603,
}
STYLE_IDS = {
    "Theme.NoTitleBar.Fullscreen": 0x01030007,
    "Theme.Black.NoTitleBar.Fullscreen": 0x0103000A,
    "Theme.DeviceDefault.NoActionBar.Fullscreen": 0x0103012A,
    "Theme.Material.NoActionBar.Fullscreen": 0x0103022F,
}
BOOL_ATTRS = {"required", "allowBackup", "hardwareAccelerated", "requestLegacyExternalStorage", "stateNotNeeded",
              "clearTaskOnLaunch", "excludeFromRecents", "exported", "enabled", "largeHeap", "resumeWhilePausing"}
INT_ATTRS = {"versionCode", "minSdkVersion", "targetSdkVersion"}
ENUMS = {
    "launchMode": {"standard": 0, "singleTop": 1, "singleTask": 2, "singleInstance": 3},
    "screenOrientation": {"unspecified": -1, "landscape": 0, "portrait": 1, "user": 2, "behind": 3,
                          "sensor": 4, "nosensor": 5, "sensorLandscape": 6, "fullSensor": 10},
}
FLAGS = {
    "configChanges": {"mcc": 0x1, "mnc": 0x2, "locale": 0x4, "touchscreen": 0x8, "keyboard": 0x10,
                      "keyboardHidden": 0x20, "navigation": 0x40, "orientation": 0x80, "screenLayout": 0x100,
                      "uiMode": 0x200, "screenSize": 0x400, "smallestScreenSize": 0x800, "density": 0x1000,
                      "layoutDirection": 0x2000, "fontScale": 0x40000000},
}

T_REFERENCE, T_STRING, T_INT_DEC, T_INT_HEX, T_BOOL = 0x01, 0x03, 0x10, 0x11, 0x12
NO_INDEX = 0xFFFFFFFF


def chunk(ctype, header_rest, body, header_size=None):
    hs = header_size if header_size is not None else 8 + len(header_rest)
    return struct.pack("<HHI", ctype, hs, hs + len(body)) + header_rest + body


def string_pool(strings):
    """UTF-16 string pool chunk (RES_STRING_POOL_TYPE)."""
    offsets, data = [], b""
    for s in strings:
        offsets.append(len(data))
        enc = s.encode("utf-16-le")
        n = len(enc) // 2
        if n > 0x7FFF:
            raise ValueError("string too long")
        data += struct.pack("<H", n) + enc + b"\x00\x00"
    data += b"\x00" * ((4 - len(data) % 4) % 4)
    strings_start = 28 + 4 * len(strings)
    header = struct.pack("<IIIII", len(strings), 0, 0, strings_start, 0)
    return chunk(0x0001, header, b"".join(struct.pack("<I", o) for o in offsets) + data)


class Pool:
    def __init__(self):
        self.items = []
        self.index = {}

    def add(self, s):
        if s not in self.index:
            self.index[s] = len(self.items)
            self.items.append(s)
        return self.index[s]


# --------------------------------------------------------------------------- resources.arsc

def build_arsc(package, drawables):
    """drawables: list of (name, path-in-apk). One type ('drawable'), nodpi config."""
    values = string_pool([p for _, p in drawables])
    type_pool = string_pool(["drawable"])
    key_pool = string_pool([n for n, _ in drawables])
    n = len(drawables)

    spec = chunk(0x0202, struct.pack("<BBHI", 1, 0, 0, n), b"\x00\x00\x00\x00" * n)

    config = bytearray(64)
    struct.pack_into("<I", config, 0, 64)
    struct.pack_into("<H", config, 14, 0xFFFF)   # density: nodpi
    struct.pack_into("<H", config, 24, 4)        # sdkVersion 4 (aapt adds -v4 to nodpi)
    header_size = 20 + len(config)
    entries = b""
    offsets = b""
    for i in range(n):
        offsets += struct.pack("<I", len(entries))
        entries += struct.pack("<HHI", 8, 0, i)                 # ResTable_entry: size, flags, key
        entries += struct.pack("<HBBI", 8, 0, T_STRING, i)      # Res_value -> values pool
    entries_start = header_size + 4 * n
    type_header = struct.pack("<BBHII", 1, 0, 0, n, entries_start) + bytes(config)
    rtype = chunk(0x0201, type_header, offsets + entries)

    name = package.encode("utf-16-le")[:254].ljust(256, b"\x00")
    pkg_header_size = 288
    type_off = pkg_header_size
    key_off = type_off + len(type_pool)
    pkg_header = struct.pack("<I", 0x7F) + name + struct.pack("<IIIII", type_off, 1, key_off, n, 0)
    pkg = chunk(0x0200, pkg_header, type_pool + key_pool + spec + rtype)
    return chunk(0x0002, struct.pack("<I", 1), values + pkg)


# --------------------------------------------------------------------------- binary manifest

def compile_manifest(path, drawable_ids):
    tree = ET.parse(path)
    root = tree.getroot()

    def split(tag):
        if tag.startswith("{"):
            ns, local = tag[1:].split("}", 1)
            return ns, local
        return None, tag

    # string pool: attribute names that have resource IDs must come first, matching the resource map
    res_attrs = []
    for el in root.iter():
        for k in el.attrib:
            ns, local = split(k)
            if ns == ANDROID_NS:
                if local not in ATTR_IDS:
                    sys.exit("mkapk: unknown android attribute '%s' - add its ID to ATTR_IDS" % local)
                if local not in res_attrs:
                    res_attrs.append(local)
    res_attrs.sort(key=lambda a: ATTR_IDS[a])
    pool = Pool()
    for a in res_attrs:
        pool.add(a)
    pool.add("android")
    pool.add(ANDROID_NS)

    def value(local, ns, text):
        if text.startswith("@android:style/"):
            return T_REFERENCE, STYLE_IDS[text.split("/", 1)[1]], NO_INDEX
        if text.startswith("@drawable/"):
            return T_REFERENCE, drawable_ids[text.split("/", 1)[1]], NO_INDEX
        if ns == ANDROID_NS:
            if local in BOOL_ATTRS:
                return T_BOOL, 0xFFFFFFFF if text == "true" else 0, NO_INDEX
            if local in INT_ATTRS:
                return T_INT_DEC, int(text), NO_INDEX
            if local in ENUMS:
                return T_INT_DEC, ENUMS[local][text] & 0xFFFFFFFF, NO_INDEX
            if local in FLAGS:
                v = 0
                for f in text.split("|"):
                    v |= FLAGS[local][f.strip()]
                return T_INT_HEX, v, NO_INDEX
        idx = pool.add(text)
        return T_STRING, idx, idx

    body = []
    line = [1]

    def node_header():
        line[0] += 1
        return struct.pack("<II", line[0], NO_INDEX)

    ns_ext = struct.pack("<II", pool.index["android"], pool.index[ANDROID_NS])
    body.append(chunk(0x0100, node_header(), ns_ext, header_size=16))

    def emit(el):
        _, tag = split(el.tag)
        name_idx = pool.add(tag)
        attrs = []
        for k, v in el.attrib.items():
            ns, local = split(k)
            nidx = pool.add(local)
            dtype, data, raw = value(local, ns, v)
            attrs.append((ATTR_IDS.get(local, 0xFFFFFFFF) if ns == ANDROID_NS else 0xFFFFFFFF, ns, nidx, raw, dtype, data))
        # sorted by resource ID, as aapt does (the framework binary-searches them)
        attrs.sort(key=lambda a: (a[0], a[2]))
        abytes = b""
        for _rid, ns, nidx, raw, dtype, data in attrs:
            ns_idx = pool.index[ANDROID_NS] if ns == ANDROID_NS else NO_INDEX
            abytes += struct.pack("<IIIHBBI", ns_idx, nidx, raw, 8, 0, dtype, data)
        ext = struct.pack("<IIHHHHHH", NO_INDEX, name_idx, 20, 20, len(attrs), 0, 0, 0)
        body.append(chunk(0x0102, node_header(), ext + abytes, header_size=16))
        for child in el:
            emit(child)
        body.append(chunk(0x0103, node_header(), struct.pack("<II", NO_INDEX, name_idx), header_size=16))

    emit(root)
    body.append(chunk(0x0101, node_header(), ns_ext, header_size=16))

    resmap = chunk(0x0180, b"", b"".join(struct.pack("<I", ATTR_IDS[a]) for a in res_attrs))
    return chunk(0x0003, b"", string_pool(pool.items) + resmap + b"".join(body)), root.get("package")


# --------------------------------------------------------------------------- zip

def write_apk(out, entries):
    """entries: list of (name, bytes, compress). Stored entries are aligned to 4 bytes."""
    with zipfile.ZipFile(out, "w") as zf:
        for name, data, compress in entries:
            zi = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            zi.external_attr = 0o644 << 16
            if compress:
                zi.compress_type = zipfile.ZIP_DEFLATED
            else:
                zi.compress_type = zipfile.ZIP_STORED
                offset = zf.fp.tell() + 30 + len(name.encode())
                zi.extra = b"\x00" * ((4 - offset % 4) % 4)
            zf.writestr(zi, data)


def main():
    if len(sys.argv) != 5:
        sys.exit(__doc__)
    manifest, res_dir, dex, out = sys.argv[1:]
    names = sorted(f for f in os.listdir(os.path.join(res_dir, "drawable")) if f.endswith(".png"))
    drawables = [(os.path.splitext(f)[0], "res/drawable-nodpi-v4/" + f) for f in names]
    ids = {n: 0x7F010000 | i for i, (n, _) in enumerate(drawables)}

    axml, package = compile_manifest(manifest, ids)
    arsc = build_arsc(package, drawables)
    entries = [("AndroidManifest.xml", axml, True), ("classes.dex", open(dex, "rb").read(), True),
               ("resources.arsc", arsc, False)]
    for f, (_, apk_path) in zip(names, drawables):
        entries.append((apk_path, open(os.path.join(res_dir, "drawable", f), "rb").read(), False))
    write_apk(out, entries)
    print("mkapk: wrote %s (%d bytes, package %s)" % (out, os.path.getsize(out), package))


if __name__ == "__main__":
    main()
