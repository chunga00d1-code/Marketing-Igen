import { useState, type Dispatch, type SetStateAction } from 'react';
import { bulkCreateService, type BulkRenderJob } from '../../../services/bulkCreateService';
import { toast } from '../../../pages/Toast';
import type { DataRow, PageRenderState, TemplateLayer } from './types';
import type { BulkSceneDocument } from './SceneCanvas';
import { createRow, pageFilename, triggerFileDownload } from './workspace-utils';

interface UseBulkPageActionsOptions {
  layers: TemplateLayer[];
  setLayers: Dispatch<SetStateAction<TemplateLayer[]>>;
  rows: DataRow[];
  setRows: Dispatch<SetStateAction<DataRow[]>>;
  activeRowId: string;
  setActiveRowId: Dispatch<SetStateAction<string>>;
  setPagesCreated: Dispatch<SetStateAction<boolean>>;
  pageResults: Record<string, PageRenderState>;
  setPageResults: Dispatch<SetStateAction<Record<string, PageRenderState>>>;
  editorScene: BulkSceneDocument;
  setErrorMessage: Dispatch<SetStateAction<string>>;
}

export function useBulkPageActions({
  layers,
  setLayers,
  rows,
  setRows,
  activeRowId,
  setActiveRowId,
  setPagesCreated,
  pageResults,
  setPageResults,
  editorScene,
  setErrorMessage,
}: UseBulkPageActionsOptions) {
  const [copiedPage, setCopiedPage] = useState<DataRow | null>(null);
  const [downloadingJob, setDownloadingJob] = useState(false);

  const updateCell = (rowId: string, layerId: string, value: string) => {
    const layer = layers.find((item) => item.id === layerId);
    if (!layer) return;
    const bindingKey = layer.dataBinding?.columnKey;
    if (rows.length === 1 && !bindingKey) {
      setLayers((current) => current.map((item) =>
        item.id === layerId ? { ...item, defaultValue: value } : item
      ));
    }
    setRows((current) => current.map((row) => row.id === rowId
      ? {
          ...row,
          values: { ...row.values, [layerId]: value },
          ...(bindingKey
            ? { sourceCells: { ...(row.sourceCells || {}), [bindingKey]: value } }
            : {}),
        }
      : row));
  };

  const addRow = () => {
    const row = createRow(layers);
    setRows((current) => [...current, row]);
    setActiveRowId(row.id);
    setPagesCreated(true);
  };

  const duplicateRow = (row: DataRow) => {
    const duplicated = {
      ...createRow(layers, row.values),
      name: row.name ? `${row.name} - bản sao` : undefined,
      sourceCells: row.sourceCells ? { ...row.sourceCells } : undefined,
      campaignAssetOrderId: row.campaignAssetOrderId,
      campaignSlotId: row.campaignSlotId,
    };
    setRows((current) => [...current, duplicated]);
    setActiveRowId(duplicated.id);
    setPagesCreated(true);
  };

  const removeRow = (rowId: string) => {
    setPageResults((current) => {
      if (!current[rowId]) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    if (rows.length === 1) {
      const replacement = createRow(layers);
      setRows([replacement]);
      setActiveRowId(replacement.id);
      return;
    }
    const nextRows = rows.filter((row) => row.id !== rowId);
    setRows(nextRows);
    if (activeRowId === rowId) setActiveRowId(nextRows[0].id);
  };

  const copyPage = (row: DataRow) => {
    setCopiedPage({
      ...row,
      values: { ...row.values },
      sourceCells: row.sourceCells ? { ...row.sourceCells } : undefined,
    });
    toast.success(`Đã sao chép ${row.name || 'trang'}.`);
  };

  const insertPageAfter = (source: DataRow, afterRowId: string, name?: string) => {
    const inserted = {
      ...createRow(layers, source.values),
      name,
      sourceCells: source.sourceCells ? { ...source.sourceCells } : undefined,
      campaignAssetOrderId: source.campaignAssetOrderId,
      campaignSlotId: source.campaignSlotId,
      selected: true,
    };
    setRows((current) => {
      const targetIndex = current.findIndex((row) => row.id === afterRowId);
      const insertIndex = targetIndex >= 0 ? targetIndex + 1 : current.length;
      const next = [...current];
      next.splice(insertIndex, 0, inserted);
      return next;
    });
    setActiveRowId(inserted.id);
    setPagesCreated(true);
  };

  const pastePageAfter = (afterRowId: string) => {
    if (!copiedPage) return;
    insertPageAfter(copiedPage, afterRowId, copiedPage.name ? `${copiedPage.name} - bản sao` : 'Trang đã dán');
  };

  const duplicatePage = (row: DataRow) => {
    insertPageAfter(row, row.id, row.name ? `${row.name} - bản sao` : 'Trang bản sao');
  };

  const renamePage = (rowId: string, name: string) => {
    const normalizedName = name.trim().slice(0, 80);
    if (!normalizedName) return;
    setRows((current) => current.map((row) => row.id === rowId ? { ...row, name: normalizedName } : row));
  };

  const downloadPage = async (row: DataRow, index: number) => {
    const name = row.name || `Trang ${index + 1}`;
    const filename = pageFilename(name, index);
    const result = pageResults[row.id];
    try {
      if (result?.status === 'completed' && result.outputUrl) {
        await bulkCreateService.downloadImage(result.outputUrl, filename);
        return;
      }
      if (editorScene.layers.length === 0) {
        toast.error('Hãy thêm ít nhất một nội dung chữ hoặc ảnh trước khi tải trang.');
        return;
      }
      toast.info(`Đang chuẩn bị tải “${name}”...`);
      const previewUrl = await bulkCreateService.previewScene({
        name,
        sceneVersion: editorScene.sceneVersion,
        canvas: editorScene.canvas,
        background: editorScene.background,
        layers: editorScene.layers,
      }, row.values);
      triggerFileDownload(previewUrl, filename);
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 10_000);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Không thể tải trang.');
    }
  };

  const downloadJob = async (job: BulkRenderJob) => {
    if (downloadingJob) return;
    setDownloadingJob(true);
    try {
      await bulkCreateService.downloadZip(job._id, job.templateName);
      toast.success('Đã bắt đầu tải file ZIP.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Không thể tải file ZIP.';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setDownloadingJob(false);
    }
  };

  return {
    copiedPage,
    downloadingJob,
    updateCell,
    addRow,
    duplicateRow,
    removeRow,
    copyPage,
    pastePageAfter,
    duplicatePage,
    renamePage,
    downloadPage,
    downloadJob,
  };
}
