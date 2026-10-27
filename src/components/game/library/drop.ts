/**
 * Files from a drop, as the plain `File[]` an import takes.
 *
 * A dropped folder is not in `DataTransfer.files`: the browser only puts the
 * entries in the item list, and a directory has to be walked with the
 * non-standard `webkitGetAsEntry()` reader. A drop with no entry API falls back to
 * the flat file list, which is still a usable import.
 *
 * A `File` from a directory entry carries no `webkitRelativePath`, so each one is
 * wrapped in a new `File` (sharing the same blob data) with that path attached.
 * The import's root/path arithmetic is then the same for a drop as for a directory
 * input — one code path, not a second way of naming a tree.
 */

interface ReaderLike {
  readEntries(
    onEntries: (entries: EntryLike[]) => void,
    onError?: (error: unknown) => void,
  ): void;
}

interface EntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?(onFile: (file: File) => void, onError?: (error: unknown) => void): void;
  createReader?(): ReaderLike;
}

/** Collect every file under a drop, with a relative path on each one. */
export async function filesFromDrop(transfer: DataTransfer): Promise<File[]> {
  const entries: EntryLike[] = [];
  for (const item of Array.from(transfer.items)) {
    if (item.kind !== "file") continue;
    const entry = item.webkitGetAsEntry?.() as EntryLike | null;
    if (entry) entries.push(entry);
  }
  if (entries.length === 0) return Array.from(transfer.files);

  const files: File[] = [];
  for (const entry of entries) await walk(entry, files, "");
  return files.length > 0 ? files : Array.from(transfer.files);
}

async function walk(entry: EntryLike, into: File[], prefix: string): Promise<void> {
  if (entry.isFile) {
    const file = await readFile(entry);
    if (file) into.push(withPath(file, `${prefix}${file.name}`));
    return;
  }
  if (!entry.isDirectory || !entry.createReader) return;
  const children = await readAll(entry.createReader());
  const next = `${prefix}${entry.name}/`;
  for (const child of children) await walk(child, into, next);
}

function readFile(entry: EntryLike): Promise<File | null> {
  if (!entry.file) return Promise.resolve(null);
  return new Promise((resolve) => {
    entry.file?.(
      (file) => resolve(file),
      () => resolve(null),
    );
  });
}

/** `readEntries` hands back at most 100 at a time, so keep asking until empty. */
function readAll(reader: ReaderLike): Promise<EntryLike[]> {
  return new Promise((resolve) => {
    const all: EntryLike[] = [];
    const next = () => {
      reader.readEntries(
        (entries) => {
          if (entries.length === 0) {
            resolve(all);
            return;
          }
          all.push(...entries);
          next();
        },
        () => resolve(all),
      );
    };
    next();
  });
}

function withPath(file: File, path: string): File {
  const copy = new File([file], file.name, {
    type: file.type,
    lastModified: file.lastModified,
  });
  Object.defineProperty(copy, "webkitRelativePath", {
    configurable: true,
    value: path,
  });
  return copy;
}
