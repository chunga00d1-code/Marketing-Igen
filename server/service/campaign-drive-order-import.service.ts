export interface CampaignDriveImportFile {
  id: string;
  name: string;
  directUrl: string;
  isVideo: boolean;
}

export interface CampaignDriveImportOrder {
  orderId: string;
  slotId: string;
  title: string;
  scheduledAt: Date | string;
}

export interface CampaignDriveImportMapping extends CampaignDriveImportOrder {
  position: number;
  files: CampaignDriveImportFile[];
}

export interface CampaignDriveImportPreview {
  totalOrders: number;
  totalFiles: number;
  mappedOrders: number;
  missingOrders: Array<CampaignDriveImportOrder & { position: number }>;
  unmatchedFiles: CampaignDriveImportFile[];
  mappings: CampaignDriveImportMapping[];
}

const MEDIA_FILE_PATTERN = /\.(jpe?g|png|webp|gif|heic|mp4|mov|avi|webm)$/i;

function getPostNumber(fileName: string) {
  const match = fileName.match(/\d+/);
  if (!match) return null;
  const value = Number.parseInt(match[0], 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function compareMediaFiles(left: CampaignDriveImportFile, right: CampaignDriveImportFile) {
  const leftNumbers = left.name.match(/\d+/g) || [];
  const rightNumbers = right.name.match(/\d+/g) || [];
  const leftSubIndex = leftNumbers[1] ? Number.parseInt(leftNumbers[1], 10) : 0;
  const rightSubIndex = rightNumbers[1] ? Number.parseInt(rightNumbers[1], 10) : 0;
  if (leftSubIndex !== rightSubIndex) return leftSubIndex - rightSubIndex;
  return left.name.localeCompare(right.name, "vi", { numeric: true, sensitivity: "base" });
}

export function buildCampaignDriveImportPreview(
  orders: CampaignDriveImportOrder[],
  files: CampaignDriveImportFile[]
): CampaignDriveImportPreview {
  const validFiles = files.filter((file) => MEDIA_FILE_PATTERN.test(file.name));
  const filesByPosition = new Map<number, CampaignDriveImportFile[]>();
  const unmatchedFiles: CampaignDriveImportFile[] = [];

  for (const file of validFiles) {
    const position = getPostNumber(file.name);
    if (!position || position > orders.length) {
      unmatchedFiles.push(file);
      continue;
    }
    const current = filesByPosition.get(position) || [];
    current.push(file);
    filesByPosition.set(position, current);
  }

  const mappings = orders.map((order, index) => ({
    ...order,
    position: index + 1,
    files: (filesByPosition.get(index + 1) || []).sort(compareMediaFiles),
  }));

  return {
    totalOrders: orders.length,
    totalFiles: validFiles.length,
    mappedOrders: mappings.filter((mapping) => mapping.files.length > 0).length,
    missingOrders: mappings
      .filter((mapping) => mapping.files.length === 0)
      .map(({ files: _files, ...mapping }) => mapping),
    unmatchedFiles: unmatchedFiles.sort(compareMediaFiles),
    mappings,
  };
}
