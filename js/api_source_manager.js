// Module-level variables (private)
const APISourceManager = {
    /**
     * Initialize API source management
     */
    init: function () {
        this.initAPICheckboxes();
        this.renderCustomAPIsList();
        this.updateSelectedApiCount();
        this.checkAdultAPIsSelected();
    },

    /**
     * Initialize API checkboxes in the UI
     */
    initAPICheckboxes: function () {
        const container = DOMCache.get('apiCheckboxes') || document.getElementById('apiCheckboxes');
        if (!container) return;

        container.innerHTML = '';

        // 普通API组标题
        let titleNormal = document.createElement('div');
        titleNormal.className = 'api-group-title';
        titleNormal.textContent = '普通资源';
        container.appendChild(titleNormal);

        // 普通API
        Object.keys(API_SITES).forEach(apiKey => {
            const api = API_SITES[apiKey];
            if (api.adult) return;
            let box = document.createElement('div');
            box.className = 'flex items-center';
            box.innerHTML = `<input type="checkbox" id="api_${apiKey}" 
                class="form-checkbox h-3 w-3 text-blue-600 bg-[#222] border border-[#333]" 
                ${AppState.get('selectedAPIs').includes(apiKey) ? 'checked' : ''} data-api="${apiKey}">
                <label for="api_${apiKey}" class="ml-1 text-xs text-gray-400 truncate">${api.name}</label>`;
            container.appendChild(box);
            box.querySelector('input').addEventListener('change', () => {
                this.updateSelectedAPIs();
                this.checkAdultAPIsSelected();
            });
        });

        // 内置成人API组（如未屏蔽）
        if (!HIDE_BUILTIN_ADULT_APIS) {
            let titleAdult = document.createElement('div');
            titleAdult.className = 'api-group-title adult';
            titleAdult.innerHTML = `黄色资源采集站 <span class="adult-warning">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="width:1em;height:1em">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                </svg>
            </span>`;
            container.appendChild(titleAdult);
            Object.keys(API_SITES).filter(key => API_SITES[key].adult).forEach(apiKey => {
                const api = API_SITES[apiKey];
                let box = document.createElement('div');
                box.className = 'flex items-center';
                box.innerHTML = `<input type="checkbox" id="api_${apiKey}" 
                    class="form-checkbox h-3 w-3 text-blue-600 bg-[#222] border border-[#333] api-adult"
                    ${AppState.get('selectedAPIs').includes(apiKey) ? 'checked' : ''} data-api="${apiKey}">
                    <label for="api_${apiKey}" class="ml-1 text-xs text-pink-400 truncate">${api.name}</label>`;
                container.appendChild(box);
                box.querySelector('input').addEventListener('change', () => {
                    this.updateSelectedAPIs();
                    this.checkAdultAPIsSelected();
                });
            });
        }
    },

    /**
     * Check if adult APIs are selected and manage yellow filter accordingly
     */
    checkAdultAPIsSelected: function () {
        const adultBuiltin = document.querySelectorAll('#apiCheckboxes .api-adult:checked');
        const customAdult = document.querySelectorAll('#customApisList .api-adult:checked');
        const hasAdult = adultBuiltin.length > 0 || customAdult.length > 0;
        const yellowToggle = DOMCache.get('yellowFilterToggle') || document.getElementById('yellowFilterToggle');
        const row = yellowToggle?.closest('div')?.parentNode;
        const desc = row?.querySelector('p.filter-description');
        if (!yellowToggle) return;
        if (hasAdult) {
            yellowToggle.checked = false;
            yellowToggle.disabled = true;
            localStorage.setItem('yellowFilterEnabled', 'false');
            row?.classList.add('filter-disabled');
            if (desc) desc.innerHTML = '<strong class="text-pink-300">选中黄色资源站时无法启用此过滤</strong>';
            // 去除提示信息
            row?.querySelector('.filter-tooltip')?.remove();
        } else {
            yellowToggle.disabled = false;
            row?.classList.remove('filter-disabled');
            if (desc) desc.textContent = '过滤"伦理片"等黄色内容';
            row?.querySelector('.filter-tooltip')?.remove();
        }
    },

    /**
     * Render the list of custom APIs
     */
    renderCustomAPIsList: function () {
        const container = DOMCache.get('customApisList') || document.getElementById('customApisList');
        if (!container) return;

        const customAPIs = AppState.get('customAPIs');
        container.innerHTML = customAPIs.length ?
            '' : '<p class="text-xs text-gray-500 text-center my-2">未添加自定义API</p>';

        customAPIs.forEach((api, idx) => {
            const item = document.createElement('div');
            item.className = 'flex items-center justify-between p-1 mb-1 bg-[#222] rounded';
            const textColorClass = api.isAdult ? 'text-pink-400' : 'text-white';
            const adultTag = api.isAdult ? '<span class="text-xs text-pink-400 mr-1">(18+)</span>' : '';
            item.innerHTML = `
                <div class="flex items-center flex-1 min-w-0">
                    <input type="checkbox" id="custom_api_${idx}" 
                        class="form-checkbox h-3 w-3 text-blue-600 mr-1 ${api.isAdult ? 'api-adult' : ''}"
                        ${AppState.get('selectedAPIs').includes('custom_' + idx) ? 'checked' : ''} data-custom-index="${idx}">
                    <div class="flex-1 min-w-0">
                        <div class="text-xs font-medium ${textColorClass} truncate">${adultTag}${api.name}</div>
                        <div class="text-xs text-gray-500 truncate">${api.url}</div>
                    </div>
                </div>
                <div class="flex items-center">
                    <button class="text-blue-500 hover:text-blue-700 text-xs px-1" onclick="APISourceManager.editCustomApi(${idx})">✎</button>
                    <button class="text-red-500 hover:text-red-700 text-xs px-1" onclick="APISourceManager.removeCustomApi(${idx})">✕</button>
                </div>`;
            container.appendChild(item);
            item.querySelector('input').addEventListener('change', () => {
                this.updateSelectedAPIs();
                this.checkAdultAPIsSelected();
            });
        });
    },

    /**
     * Edit a custom API
     * @param {number} index - Index of the API to edit
     */
    editCustomApi: function (index) {
        const customAPIs = AppState.get('customAPIs');
        if (index < 0 || index >= customAPIs.length) return;

        const api = customAPIs[index];
        const nameInput = DOMCache.get('customApiName') || document.getElementById('customApiName');
        const urlInput = DOMCache.get('customApiUrl') || document.getElementById('customApiUrl');
        const isAdultInput = DOMCache.get('customApiIsAdult') || document.getElementById('customApiIsAdult');

        // 填充表单数据
        nameInput.value = api.name;
        urlInput.value = api.url;
        if (isAdultInput) isAdultInput.checked = !!api.isAdult;

        // 显示表单
        const form = DOMCache.get('addCustomApiForm') || document.getElementById('addCustomApiForm');
        if (form) {
            form.classList.remove('hidden');

            // 替换表单按钮操作
            const buttonContainer = form.querySelector('div:last-child');
            buttonContainer.innerHTML = `
                <button onclick="APISourceManager.updateCustomApi(${index})" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">更新</button>
                <button onclick="APISourceManager.cancelEditCustomApi()" class="bg-[#444] hover:bg-[#555] text-white px-3 py-1 rounded text-xs">取消</button>
            `;
        }
    },

    /**
     * Update a custom API
     * @param {number} index - Index of the API to update
     */
    updateCustomApi: function (index) {
        const customAPIs = AppState.get('customAPIs');
        if (index < 0 || index >= customAPIs.length) return;

        const nameInput = DOMCache.get('customApiName') || document.getElementById('customApiName');
        const urlInput = DOMCache.get('customApiUrl') || document.getElementById('customApiUrl');
        const isAdultInput = DOMCache.get('customApiIsAdult') || document.getElementById('customApiIsAdult');

        const name = nameInput.value.trim();
        let url = urlInput.value.trim();
        const isAdult = isAdultInput ? isAdultInput.checked : false;

        if (!name || !url) {
            showToast('请输入API名称和链接', 'warning');
            return;
        }

        // 确保URL格式正确
        if (!/^https?:\/\/.+/.test(url)) {
            showToast('API链接格式不正确，需以http://或https://开头', 'warning');
            return;
        }

        // 移除URL末尾的斜杠
        if (url.endsWith('/')) url = url.slice(0, -1);

        // 更新API信息
        const updatedCustomAPIs = [...customAPIs];
        updatedCustomAPIs[index] = { name, url, isAdult };
        AppState.set('customAPIs', updatedCustomAPIs);
        localStorage.setItem('customAPIs', JSON.stringify(updatedCustomAPIs));

        // 重新渲染自定义API列表
        this.renderCustomAPIsList();

        // 重新检查成人API选中状态
        this.checkAdultAPIsSelected();

        // 恢复添加按钮
        this.restoreAddCustomApiButtons();

        // 清空表单并隐藏
        nameInput.value = '';
        urlInput.value = '';
        if (isAdultInput) isAdultInput.checked = false;

        const form = DOMCache.get('addCustomApiForm') || document.getElementById('addCustomApiForm');
        if (form) form.classList.add('hidden');

        showToast('已更新自定义API: ' + name, 'success');
    },

    /**
     * Select all APIs
     * @param {boolean} selectAll - Whether to select all APIs
     * @param {boolean} excludeAdult - Whether to exclude adult APIs
     */
    selectAllAPIs: function (selectAll = true, excludeAdult = false) {
        // IMPORTANT: HTML using this function via onclick must be updated to call APISourceManager.selectAllAPIs(...)
        const checkboxes = document.querySelectorAll('#apiCheckboxes input[type="checkbox"]');
        checkboxes.forEach(box => {
            if (excludeAdult && box.classList.contains('api-adult')) box.checked = false;
            else box.checked = selectAll;
        });
        this.updateSelectedAPIs();
        this.checkAdultAPIsSelected();
    },

    /**
     * Update selected APIs
     */
    updateSelectedAPIs: function () {
        const builtIn = Array.from(document.querySelectorAll('#apiCheckboxes input:checked')).map(input => input.dataset.api);
        const custom = Array.from(document.querySelectorAll('#customApisList input:checked')).map(input => 'custom_' + input.dataset.customIndex);
        const selectedAPIs = [...builtIn, ...custom];

        AppState.set('selectedAPIs', selectedAPIs);
        localStorage.setItem('selectedAPIs', JSON.stringify(selectedAPIs));
        this.updateSelectedApiCount();
    },

    /**
     * Update selected API count
     */
    updateSelectedApiCount: function () {
        const countElement = DOMCache.get('selectedApiCount') || document.getElementById('selectedApiCount');
        if (countElement) {
            countElement.textContent = AppState.get('selectedAPIs').length;
        }
    },

    /**
     * Add a custom API
     */
    addCustomApi: function () {
        const nameInput = DOMCache.get('customApiName') || document.getElementById('customApiName');
        const urlInput = DOMCache.get('customApiUrl') || document.getElementById('customApiUrl');
        const isAdultInput = DOMCache.get('customApiIsAdult') || document.getElementById('customApiIsAdult');

        const name = nameInput.value.trim();
        let url = urlInput.value.trim();
        const isAdult = isAdultInput ? isAdultInput.checked : false;

        if (!name || !url) {
            showToast('请输入API名称和链接', 'warning');
            return;
        }

        // 确保URL格式正确
        if (!/^https?:\/\/.+/.test(url)) {
            showToast('API链接格式不正确，需以http://或https://开头', 'warning');
            return;
        }

        // 移除URL末尾的斜杠
        if (url.endsWith('/')) url = url.slice(0, -1);

        // 添加到自定义API列表 - 增加isAdult属性
        const customAPIs = AppState.get('customAPIs');
        const updatedCustomAPIs = [...customAPIs, { name, url, isAdult }];
        AppState.set('customAPIs', updatedCustomAPIs);
        localStorage.setItem('customAPIs', JSON.stringify(updatedCustomAPIs));

        // 默认选中新添加的API
        const newApiIndex = updatedCustomAPIs.length - 1;
        const selectedAPIs = AppState.get('selectedAPIs');
        const updatedSelectedAPIs = [...selectedAPIs, 'custom_' + newApiIndex];
        AppState.set('selectedAPIs', updatedSelectedAPIs);
        localStorage.setItem('selectedAPIs', JSON.stringify(updatedSelectedAPIs));

        // 重新渲染自定义API列表
        this.renderCustomAPIsList();

        // 更新选中的API数量
        this.updateSelectedApiCount();

        // 重新检查成人API选中状态
        this.checkAdultAPIsSelected();

        // 清空表单并隐藏
        nameInput.value = '';
        urlInput.value = '';
        if (isAdultInput) isAdultInput.checked = false;

        const form = DOMCache.get('addCustomApiForm') || document.getElementById('addCustomApiForm');
        if (form) form.classList.add('hidden');

        showToast('已添加自定义API: ' + name, 'success');
    },

    /**
     * Remove a custom API
     * @param {number} index - Index of the API to remove
     */
    removeCustomApi: function (index) {
        const customAPIs = AppState.get('customAPIs');
        if (index < 0 || index >= customAPIs.length) return;

        const apiName = customAPIs[index].name;

        // 从列表中移除
        const updatedCustomAPIs = [...customAPIs];
        updatedCustomAPIs.splice(index, 1);
        AppState.set('customAPIs', updatedCustomAPIs);
        localStorage.setItem('customAPIs', JSON.stringify(updatedCustomAPIs));

        // 从选中列表中移除
        const selectedAPIs = AppState.get('selectedAPIs');
        const customApiCode = 'custom_' + index;
        const updatedSelectedAPIs = selectedAPIs.filter(api => api !== customApiCode);

        // 更新后续自定义API的索引
        const finalSelectedAPIs = updatedSelectedAPIs.map(api => {
            if (api.startsWith('custom_')) {
                const apiIndex = parseInt(api.split('_')[1]);
                if (apiIndex > index) {
                    return 'custom_' + (apiIndex - 1);
                }
            }
            return api;
        });

        AppState.set('selectedAPIs', finalSelectedAPIs);
        localStorage.setItem('selectedAPIs', JSON.stringify(finalSelectedAPIs));

        // 重新渲染自定义API列表
        this.renderCustomAPIsList();

        // 更新选中的API数量
        this.updateSelectedApiCount();

        // 重新检查成人API选中状态
        this.checkAdultAPIsSelected();

        showToast('已移除自定义API: ' + apiName, 'success');
    },

    /**
     * 取消添加自定义API
     */
    cancelAddCustomApi: function () {
        const form = DOMCache.get('addCustomApiForm') || document.getElementById('addCustomApiForm');
        if (form) {
            form.classList.add('hidden');
            // 重置表单
            const nameInput = DOMCache.get('customApiName') || document.getElementById('customApiName');
            const urlInput = DOMCache.get('customApiUrl') || document.getElementById('customApiUrl');
            const isAdultInput = DOMCache.get('customApiIsAdult') || document.getElementById('customApiIsAdult');

            if (nameInput) nameInput.value = '';
            if (urlInput) urlInput.value = '';
            if (isAdultInput) isAdultInput.checked = false;

            // 恢复默认的添加按钮
            const buttonContainer = form.querySelector('div:last-child');
            if (buttonContainer) {
                buttonContainer.innerHTML = `
                    <button onclick="addCustomApi()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">添加</button>
                    <button onclick="cancelAddCustomApi()" class="bg-[#444] hover:bg-[#555] text-white px-3 py-1 rounded text-xs">取消</button>
                `;
            }
        }
    },

    /**
     * 取消编辑自定义API
     */
    cancelEditCustomApi: function () {
        // 复用取消添加的逻辑
        this.cancelAddCustomApi();
    },

    /**
     * Restore add custom API buttons
     */
    restoreAddCustomApiButtons: function () {
        const form = DOMCache.get('addCustomApiForm') || document.getElementById('addCustomApiForm');
        if (!form) return;

        const buttonContainer = form.querySelector('div:last-child');
        buttonContainer.innerHTML = `
            <button onclick="APISourceManager.addCustomApi()" class="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs">添加</button>
            <button onclick="APISourceManager.cancelAddCustomApi()" class="bg-[#444] hover:bg-[#555] text-white px-3 py-1 rounded text-xs">取消</button>
        `;
    },

    /**
     * 根据索引获取自定义API信息
     * @param {number} index - 自定义API索引
     * @returns {object|null} - 自定义API信息对象或null
     */
    getCustomApiInfo: function (index) {
        const customAPIs = AppState.get('customAPIs'); // 从AppState获取自定义API列表
        if (customAPIs && typeof index === 'number' && index >= 0 && index < customAPIs.length) {
            return customAPIs[index]; // 返回格式应为 { name, url, isAdult }
        }
        console.warn(`getCustomApiInfo: Invalid index ${index} or customAPIs not found.`);
        return null;
    },

    /**
     * 根据来源代码获取API信息
     * @param {string} sourceCode - 来源代码 (例如 'heimuer', 'custom_0')
     * @returns {object|null} - 包含API信息的对象 (例如 { name: 'API名称', url: 'API地址', isCustom: boolean }) 或 null
     */
    getSelectedApi: function (sourceCode) {
        if (!sourceCode) {
            return null;
        }

        if (sourceCode.startsWith('custom_')) {
            const customIndex = parseInt(sourceCode.replace('custom_', ''), 10);
            const apiInfo = this.getCustomApiInfo(customIndex); // 使用 this 调用对象内部方法
            return apiInfo ? { name: apiInfo.name, url: apiInfo.url, isCustom: true } : null;
        } else {
            // 确保 API_SITES 是可访问的 (通常在 config.js 中定义并全局可用)
            if (typeof API_SITES !== 'undefined' && API_SITES[sourceCode]) {
                return { name: API_SITES[sourceCode].name, url: API_SITES[sourceCode].api, isCustom: false };
            } else {
                console.error("API_SITES 未定义或未找到 sourceCode:", sourceCode);
                return null;
            }
        }
    }
};


// 导出模块
window.APISourceManager = APISourceManager;


window.selectAllAPIs = function (selectAll, excludeAdult) {
    APISourceManager.selectAllAPIs(selectAll, excludeAdult);
};


window.showAddCustomApiForm = function () {
    APISourceManager.showAddCustomApiForm();
};

window.addCustomApi = function () {
    APISourceManager.addCustomApi();
};

window.cancelAddCustomApi = function () {
    APISourceManager.cancelAddCustomApi();
};
window.showAddCustomApiForm = function () {
    const form = DOMCache.get('addCustomApiForm') || document.getElementById('addCustomApiForm');
    if (form) form.classList.remove('hidden');
};