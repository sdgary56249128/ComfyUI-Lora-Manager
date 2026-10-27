import { BaseContextMenu } from './BaseContextMenu.js';
import { ModelContextMenuMixin } from './ModelContextMenuMixin.js';
import { getModelApiClient, resetAndReload } from '../../api/modelApiFactory.js';
import { copyLoraSyntax, sendLoraToWorkflow, buildLoraSyntax, getLoraStrengthsFromUsageTips, copyToClipboard, showToast } from '../../utils/uiHelpers.js';
import { showExcludeModal, showDeleteModal } from '../../utils/modalUtils.js';
import { moveManager } from '../../managers/MoveManager.js';

export class LoraContextMenu extends BaseContextMenu {
    constructor() {
        super('loraContextMenu', '.model-card');
        this.nsfwSelector = document.getElementById('nsfwLevelSelector');
        this.modelType = 'lora';
        this.resetAndReload = resetAndReload;
        
        this.initNSFWSelector();
    }

    // Use the saveModelMetadata implementation from loraApi
    async saveModelMetadata(filePath, data) {
        return getModelApiClient().saveModelMetadata(filePath, data);
    }

    showMenu(x, y, card) {
        super.showMenu(x, y, card);
        this.updateExcludeMenuItem();
        this.updateEnrichMenuItem(card);
    }

    handleMenuAction(action, menuItem) {
        // First try to handle with common actions
        if (ModelContextMenuMixin.handleCommonMenuActions.call(this, action)) {
            return;
        }

        // Otherwise handle lora-specific actions
        switch(action) {
            case 'detail':
                // Trigger the main card click which shows the modal
                this.currentCard.click();
                break;
            case 'copyname':
                // Generate and copy LoRA syntax
                copyLoraSyntax(this.currentCard);
                break;
            case 'sendappend':
                // Send LoRA to workflow (append mode)
                this.sendLoraToWorkflow(false);
                break;
            case 'sendreplace':
                // Send LoRA to workflow (replace mode)
                this.sendLoraToWorkflow(true);
                break;
            case 'sendsaa':
                this.sendLoraToSaa(false);
                break;
            case 'sendsaa-triggers':
                this.sendLoraToSaa(true);
                break;
            case 'replace-preview':
                // Add a new action for replacing preview images
                getModelApiClient().replaceModelPreview(this.currentCard.dataset.filepath);
                break;
            case 'delete':
                // Call showDeleteModal directly instead of clicking the trash button
                showDeleteModal(this.currentCard.dataset.filepath);
                break;
            case 'move':
                moveManager.showMoveModal(this.currentCard.dataset.filepath);
                break;
            case 'refresh-metadata':
                getModelApiClient().refreshSingleModelMetadata(this.currentCard.dataset.filepath);
                break;
            case 'exclude':
                showExcludeModal(this.currentCard.dataset.filepath);
                break;
            case 'restore':
                this.restoreExcludedModel(this.currentCard.dataset.filepath);
                break;
        }
    }

    sendLoraToWorkflow(replaceMode) {
        const card = this.currentCard;
        const usageTips = JSON.parse(card.dataset.usage_tips || '{}');
        const folder = card.dataset.folder || '';
        const loraName = folder ? `${folder}/${card.dataset.file_name}` : card.dataset.file_name;
        const loraSyntax = buildLoraSyntax(loraName, usageTips);

        sendLoraToWorkflow(loraSyntax, replaceMode, 'lora');
    }

    // Add the LoRA to the slot list of the local Character Select SAA app,
    // optionally copying only the first trigger word group (packs can have 100+ groups)
    async sendLoraToSaa(copyTriggers) {
        const card = this.currentCard;
        const usageTips = JSON.parse(card.dataset.usage_tips || '{}');
        const { strength, clipStrength, hasClipStrength } = getLoraStrengthsFromUsageTips(usageTips);
        const folder = card.dataset.folder || '';
        const name = folder ? `${folder}/${card.dataset.file_name}` : card.dataset.file_name;

        try {
            const response = await fetch('http://127.0.0.1:51029/add-lora', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, strength, clipStrength: hasClipStrength ? clipStrength : strength })
            });
            const result = await response.json();
            if (!result.success) {
                showToast(`傳送到 SAA 失敗： ${result.error}`, {}, 'error');
                return;
            }
        } catch (error) {
            showToast('傳送到 SAA 失敗：請確認 SAA 已開啟 ', {}, 'error');
            return;
        }

        // Authors often append descriptive tags after the trigger, so only the first word of the first group is copied
        const meta = card.dataset.meta ? JSON.parse(card.dataset.meta) : null;
        const words = (meta?.trainedWords || []).join(',').split(',').map(word => word.trim());
        const trigger = words.find(word => word && !word.startsWith('<lora:'));
        if (!copyTriggers || !trigger) {
            const note = copyTriggers ? '（沒有觸發詞）' : '';
            showToast(`已加入 SAA LoRA 欄位： ${name}${note}`, {}, 'success');
            return;
        }

        // copyToClipboard() ignores custom messages, so write directly to keep the SAA status in the toast
        try {
            await navigator.clipboard.writeText(trigger);
            showToast(`已加入 SAA，已複製觸發詞： ${trigger}`, {}, 'success');
        } catch {
            await copyToClipboard(trigger);
        }
    }
}

// Mix in shared methods
Object.assign(LoraContextMenu.prototype, ModelContextMenuMixin);
