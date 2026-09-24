    let db = [], filtered = [], currPage = 1;
    let currTab = 'TẤT CẢ', currMonth = 'ALL';
    const limit = 12;

    const isClosed = (s) => ["ngưng", "hết", "đóng", "dừng"].some(k => (s||"").toLowerCase().includes(k));

    const API_CONFIG = {
        endpoint: "https://script.google.com/macros/s/AKfycbzvlmB6kLjRRkDqf1xzi6Y8pu8mjpl6q3RcU2KN1_5txxQaiK3lUtygoGI-TR4AfkGD/exec",
        refreshMs: 60 * 1000
    };
    let syncTimer = null, lastSyncAt = null, syncInFlight = false;
    function apiUrl(action) { const u=new URL(API_CONFIG.endpoint); u.searchParams.set("action",action); u.searchParams.set("_",Date.now().toString()); return u.toString(); }
    function normalizeActivity(item,index) {
        const keys=["STT","Tên chương trình","Thời gian","Địa điểm","Trang phục","Số lượng","Quyền lợi","Hạn đăng ký","Link đăng ký","Link nhóm","Đơn vị phụ trách","Trạng thái","Loại","Ghi chú"];
        const out={}; keys.forEach(k=>out[k]=item && item[k]!=null ? String(item[k]).trim() : ""); out.STT=out.STT||String(index+1); return out;
    }
    async function fetchActivitiesFromApi() {
        const response=await fetch(apiUrl("list"),{method:"GET",cache:"no-store",headers:{Accept:"application/json"}});
        const raw=await response.text(); let payload;
        try { payload=JSON.parse(raw); } catch(e) { throw new Error("Apps Script API trả về JSON không hợp lệ."); }
        if(!response.ok) throw new Error("Apps Script HTTP "+response.status);
        if(!payload || payload.ok!==true) throw new Error(payload && payload.message ? String(payload.message) : "Apps Script API không trả về ok=true.");
        if(!Array.isArray(payload.data)) throw new Error("Apps Script API không trả về mảng data.");
        return payload.data.map(normalizeActivity).filter(i=>i["Tên chương trình"]);
    }
    function rebuildDatabase(data) {
        const clean=Array.isArray(data)?data.slice().reverse():[];
        db=[...clean.filter(i=>!isClosed(i["Trạng thái"])),...clean.filter(i=>isClosed(i["Trạng thái"]))]; apply();
    }
    function updateSyncStatus(ok,msg) { const el=document.getElementById("activityCount"); if(!el)return; el.title=ok ? "Nguồn: Google Apps Script API\nĐồng bộ: "+(lastSyncAt?lastSyncAt.toLocaleString("vi-VN"):"-") : "Nguồn: Google Apps Script API\nLỗi: "+msg; }
    async function syncFromApi({silent=false}={}) {
        if(syncInFlight)return false; syncInFlight=true;
        try { const data=await fetchActivitiesFromApi(); rebuildDatabase(data); lastSyncAt=new Date(); updateSyncStatus(true); if(!silent)console.info("[Apps Script API] Đã đồng bộ "+data.length+" hoạt động."); return true; }
        catch(error) { console.error("[Apps Script API] Đồng bộ thất bại:",error); db=[]; filtered=[]; apply(); updateSyncStatus(false,error.message||String(error)); return false; }
        finally { syncInFlight=false; }
    }
    function startAutoSync() {
        if(syncTimer)clearInterval(syncTimer); syncFromApi();
        syncTimer=setInterval(()=>{if(navigator.onLine)syncFromApi({silent:true});},API_CONFIG.refreshMs);
        window.addEventListener("online",()=>syncFromApi());
        document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible")syncFromApi({silent:true});});
    }
    function load() { db=[]; filtered=[]; apply(); startAutoSync(); }    function apply() {
        const query = document.getElementById('searchInput').value.toLowerCase();
        filtered = db.filter(i => {
            const mTab = currTab === 'TẤT CẢ' || (i["Loại"] || "").toUpperCase() === currTab;
            const mSrc = i["Tên chương trình"].toLowerCase().includes(query) || (i["Đơn vị phụ trách"]||"").toLowerCase().includes(query);
            let mMo = true;
            if (currMonth !== 'ALL') {
                const d = i["Thời gian"] || "";
                mMo = activityHasMonth(i, currMonth);
            }
            return mTab && mSrc && mMo;
        });
        currPage = 1; render();
    }

    function render() {
        const grid = document.getElementById('mainGrid');
        grid.innerHTML = '';
        document.getElementById('activityCount').innerText = `Tìm thấy ${filtered.length} hoạt động`;

        const start = (currPage - 1) * limit;
        const slice = filtered.slice(start, start + limit);

        if (!slice.length) {
            grid.innerHTML = '<div class="empty-state">Không tìm thấy hoạt động nào.</div>';
            return;
        }

        slice.forEach(i => {
            const closed = isClosed(i['Trạng thái']);
            const typeRaw = (i['Loại'] || 'HOẠT ĐỘNG').toString().toUpperCase();
            const cClass = closed ? 'closed' : (typeRaw === 'CUỘC THI' ? 'contest' : typeRaw === 'WORKSHOP' ? 'workshop' : 'activity');
            const title = htmlEscape(i['Tên chương trình'] || 'Hoạt động chưa có tên');
            const type = htmlEscape(typeRaw);
            const time = htmlEscape(i['Thời gian'] || 'Chưa cập nhật');
            const benefit = htmlEscape(i['Quyền lợi'] || 'Theo quy định');
            const outfit = htmlEscape(i['Trang phục'] || 'Tự do');
            const quantity = htmlEscape(i['Số lượng'] || 'Không giới hạn');
            const registerLink = safeHref(i['Link đăng ký']);
            const registerDisabled = closed || !registerLink;

            const card = document.createElement('div');
            card.className = `card ${cClass}`;
            card.onclick = () => showM(i);
            card.innerHTML = `
                <div class="card-head">
                    <div class="tag-line">
                        <span class="type-tag">${type}</span>
                        <span class="status-tag ${closed ? '' : 'status-active'}">${closed ? 'Hết hạn' : 'Đang mở'}</span>
                    </div>
                    <h3 class="card-title">${title}</h3>
                </div>
                <div class="card-body">
                    <div class="meta-group">
                        <div class="meta-row"><i class="fas fa-clock"></i><div class="meta-text"><b>Thời gian</b><p>${time}</p></div></div>
                        <div class="meta-row"><i class="fas fa-gift"></i><div class="meta-text"><b>Quyền lợi</b><p>${benefit}</p></div></div>
                        <div class="meta-row"><i class="fas fa-tshirt"></i><div class="meta-text"><b>Trang phục</b><p>${outfit}</p></div></div>
                        <div class="meta-row"><i class="fas fa-users"></i><div class="meta-text"><b>Số lượng</b><p>${quantity}</p></div></div>
                    </div>
                </div>
                <div class="card-foot">
                    <button type="button" class="btn btn-detail">Chi tiết</button>
                    <a href="${registerDisabled ? '#' : registerLink}" target="_blank" rel="noopener noreferrer" class="btn btn-reg">${closed ? 'Đã đóng' : (registerLink ? 'Đăng ký ngay' : 'Chưa có link')}</a>
                    <button type="button" class="btn btn-share" aria-label="Sao chép thông tin"><i class="fas fa-copy"></i></button>
                </div>
            `;

            const registerButton = card.querySelector('.btn-reg');
            registerButton.addEventListener('click', event => {
                event.stopPropagation();
                if (registerDisabled) event.preventDefault();
            });

            card.querySelector('.btn-share').addEventListener('click', event => {
                event.stopPropagation();
                copyInfo(i);
            });

            grid.appendChild(card);
        });
        renderPag();
    }

    function showM(i) {
        document.getElementById('mTitle').textContent = i['Tên chương trình'] || 'Hoạt động chưa có tên';
        const groupHref = safeHref(i['Link nhóm']);
        const rows = [
            { l: '🕐 Thời gian', v: htmlEscape(i['Thời gian'] || '') },
            { l: '📍 Địa điểm', v: htmlEscape(i['Địa điểm'] || '') },
            { l: '⏳ Hạn đăng ký', v: htmlEscape(i['Hạn đăng ký'] || '') },
            { l: '👕 Trang phục', v: htmlEscape(i['Trang phục'] || 'Tự do') },
            { l: '👥 Số lượng', v: htmlEscape(i['Số lượng'] || 'Không giới hạn') },
            { l: '🎁 Quyền lợi', v: htmlEscape(i['Quyền lợi'] || '') },
            { l: '🏢 Đơn vị', v: htmlEscape(i['Đơn vị phụ trách'] || '') },
            { l: '🔗 Link Nhóm', v: groupHref ? `<a href="${groupHref}" target="_blank" rel="noopener noreferrer">${htmlEscape(i['Link nhóm'])}</a>` : null },
            { l: '📝 Ghi chú', v: htmlEscape(i['Ghi chú'] || '') }
        ];
        document.getElementById('mBody').innerHTML = rows
            .filter(r => r.v)
            .map(r => `<div class="m-item"><label>${r.l}</label><p>${r.v}</p></div>`)
            .join('');

        const closed = isClosed(i['Trạng thái']);
        const registerHref = safeHref(i['Link đăng ký']);
        const registerDisabled = closed || !registerHref;
        let footerHtml = `
            <a id="modalRegisterBtn" href="${registerDisabled ? '#' : registerHref}" target="_blank" rel="noopener noreferrer" class="btn btn-reg" style="flex:2">${closed ? 'HẾT HẠN' : (registerHref ? 'ĐĂNG KÝ NGAY' : 'CHƯA CÓ LINK')}</a>
        `;

        if (groupHref && !closed) {
            footerHtml += `<a href="${groupHref}" target="_blank" rel="noopener noreferrer" class="btn btn-group">VÀO NHÓM</a>`;
        }

        footerHtml += '<button id="modalCloseBtn" type="button" class="btn btn-detail">ĐÓNG</button>';
        document.getElementById('mFooter').innerHTML = footerHtml;

        const registerButton = document.getElementById('modalRegisterBtn');
        if (registerButton && registerDisabled) {
            registerButton.addEventListener('click', event => event.preventDefault());
        }
        document.getElementById('modalCloseBtn').addEventListener('click', closeM);

        document.getElementById('modalOverlay').style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }

    async function copyInfo(i) {
        // Giữ nội dung clipboard gọn khi dán vào Messenger/Zalo/Teams:
        // loại bỏ xuống dòng/tab ẩn từ dữ liệu Google Sheets.
        const compact = value => String(value ?? "")
            .replace(/\r\n?|\n/g, " ")
            .replace(/[\t\f\v ]+/g, " ")
            .trim();

        const title = compact(i?.["Tên chương trình"] || "Hoạt động chưa có tên");
        const time = compact(i?.["Thời gian"]);
        const location = compact(i?.["Địa điểm"]);
        const outfit = compact(i?.["Trang phục"]);
        const quantity = compact(i?.["Số lượng"]);
        const benefit = compact(i?.["Quyền lợi"]);
        const deadline = compact(i?.["Hạn đăng ký"]);
        const registerLink = compact(i?.["Link đăng ký"]);
        const groupLink = compact(i?.["Link nhóm"]);
        const unit = compact(i?.["Đơn vị phụ trách"]);
        const lines = [
            "📢 " + title.toUpperCase(),
            time ? "⏰ Thời gian: " + time : "",
            location ? "📍 Địa điểm: " + location : "",
            outfit ? "👕 Trang phục: " + outfit : "",
            quantity ? "👥 Số lượng: " + quantity : "",
            benefit ? "💎 Quyền lợi: " + benefit : "",
            unit ? "🏢 Đơn vị phụ trách: " + unit : "",
            deadline ? "⏳ Hạn đăng ký: " + deadline : "",
            registerLink ? "🔗 Link đăng ký: " + registerLink : "",
            groupLink ? "👥 Link nhóm: " + groupLink : "",
            "👉 Xem thêm các hoạt động: https://zinnodntu.github.io/hoatdongsukien/"
        ].filter(Boolean);
        const text = lines.join("\n");
        try {
            if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
            else {
                const area = document.createElement("textarea");
                area.value = text; area.style.position = "fixed"; area.style.left = "-9999px"; area.style.top = "0";
                document.body.appendChild(area); area.focus(); area.select();
                const ok = document.execCommand("copy"); document.body.removeChild(area);
                if (!ok) throw new Error("copy failed");
            }
            const toast = document.getElementById("toast");
            if (toast) {
                toast.innerText = "✓ Đã sao chép nội dung sự kiện!";
                toast.style.display = "block";
                clearTimeout(window.__copyToastTimer);
                window.__copyToastTimer = setTimeout(() => { toast.style.display = "none"; }, 2500);
            }
        } catch (error) {
            console.error("[copyInfo]", error);
            alert("Không thể sao chép tự động. Bạn hãy thử lại.");
        }
    }
    function renderPag() {
        const total = Math.ceil(filtered.length / limit);
        const nav = document.getElementById('pagination'); nav.innerHTML = "";
        if(total <= 1) return;
        for(let i=1; i<=total; i++) {
            const b = document.createElement('button');
            b.className = `p-btn ${i === currPage ? 'active' : ''}`;
            b.innerText = i;
            b.onclick = () => { currPage = i; render(); window.scrollTo({top: 200, behavior:'smooth'}); };
            nav.appendChild(b);
        }
    }

    function closeM() { document.getElementById('modalOverlay').style.display = 'none'; document.body.style.overflow = 'auto'; }
    function setTab(t) { currTab = t; document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.innerText.toUpperCase() === t)); apply(); }
    function onSearch() { apply(); }
    function onMonth() { currMonth = document.getElementById('monthFilter').value; apply(); }



    // Robust month/date detection for many Vietnamese time formats:
    // 09/05/2026, 09/5/2026, 07/05 đến 31/05/2026, 14-16/05/2026,
    // ngày 31 tháng 5 năm 2026, Tháng 05/2026, 2026-05-09, 05/2026.
    function normalizeText(str) {
        return (str || '').toString().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd').replace(/Đ/g, 'D')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function uniqueNumbersFromRegex(text, regex, groupIndex = 1) {
        const nums = [];
        let match;
        while ((match = regex.exec(text)) !== null) {
            const n = parseInt(match[groupIndex], 10);
            if (Number.isFinite(n) && n >= 1 && n <= 12) nums.push(String(n).padStart(2, '0'));
        }
        return nums;
    }

    function extractMonths(timeText) {
        const raw = (timeText || '').toString();
        const text = normalizeText(raw).replace(/[–—]/g, '-');
        const months = new Set();

        uniqueNumbersFromRegex(text, /\b\d{1,2}\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*\d{2,4})?/g).forEach(m => months.add(m));
        uniqueNumbersFromRegex(text, /\b\d{4}\s*[\/\-]\s*(\d{1,2})\s*[\/\-]\s*\d{1,2}\b/g).forEach(m => months.add(m));
        uniqueNumbersFromRegex(text, /\bthang\s*(\d{1,2})(?:\s*[\/\-]\s*\d{2,4}|\s*nam\s*\d{2,4})?/g).forEach(m => months.add(m));
        uniqueNumbersFromRegex(text, /\bngay\s*\d{1,2}\s*thang\s*(\d{1,2})\b/g).forEach(m => months.add(m));
        uniqueNumbersFromRegex(text, /\b(\d{1,2})\s*[\/\-]\s*\d{4}\b/g).forEach(m => months.add(m));

        return [...months];
    }

    function hasMonth(timeText, month) {
        return extractMonths(timeText).includes(String(month).padStart(2, '0'));
    }

    function activityHasMonth(item, month) {
        const fields = [item['Thời gian'], item['Hạn đăng ký'], item['Ghi chú']];
        return fields.some(value => hasMonth(value, month));
    }


    function extractFirstDateForMonth(item, month) {
        const targetMonth = String(month).padStart(2, '0');
        const texts = [item['Thời gian'], item['Hạn đăng ký'], item['Ghi chú']]
            .filter(Boolean)
            .map(v => v.toString().replace(/[–—]/g, '-'));
        const dates = [];

        function pushDate(day, mo, year) {
            const d = parseInt(day, 10);
            const m = parseInt(mo, 10);
            const y = parseInt(year || '2026', 10);
            if (Number.isFinite(d) && Number.isFinite(m) && Number.isFinite(y) && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
                if (String(m).padStart(2, '0') === targetMonth) dates.push(new Date(y, m - 1, d));
            }
        }

        texts.forEach(text => {
            let match;
            // 2026-05-09 hoặc 2026/05/09
            const ymd = /\b(\d{4})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{1,2})\b/g;
            while ((match = ymd.exec(text)) !== null) pushDate(match[3], match[2], match[1]);

            // 09/05/2026, 09-05-2026, 09/5
            const dmy = /\b(\d{1,2})\s*[\/-]\s*(\d{1,2})(?:\s*[\/-]\s*(\d{2,4}))?\b/g;
            while ((match = dmy.exec(text)) !== null) {
                let year = match[3] || '2026';
                if (year.length === 2) year = '20' + year;
                pushDate(match[1], match[2], year);
            }

            // ngày 30 tháng 5 năm 2026
            const vn = /ng[aà]y\s*(\d{1,2})\s*th[aá]ng\s*(\d{1,2})(?:\s*n[aă]m\s*(\d{4}))?/gi;
            while ((match = vn.exec(text)) !== null) pushDate(match[1], match[2], match[3] || '2026');
        });

        if (!dates.length) return new Date(2026, parseInt(targetMonth, 10) - 1, 31, 23, 59, 59);
        return dates.sort((a, b) => a - b)[0];
    }

    function getMonthItemsSorted(month) {
        const mm = String(month).padStart(2, '0');
        return db
            .filter(item => activityHasMonth(item, mm))
            .sort((a, b) => extractFirstDateForMonth(a, mm) - extractFirstDateForMonth(b, mm));
    }

    function htmlEscape(value) {
        return (value ?? '').toString()
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function exportMonthFile(month) {
        const mm = String(month).padStart(2, '0');
        const items = getMonthItemsSorted(mm);
        if (!items.length) {
            alert(`Không tìm thấy hoạt động nào trong tháng ${parseInt(mm, 10)}.`);
            return 0;
        }

        const columns = [
            ['STT', (_, idx) => idx + 1],
            ['TÊN CHƯƠNG TRÌNH', item => item['Tên chương trình']],
            ['THỜI GIAN', item => item['Thời gian']],
            ['ĐỊA ĐIỂM', item => item['Địa điểm']],
            ['SỐ LƯỢNG PHÂN BỔ/THỰC TẾ', item => item['Số lượng']],
            ['TRANG PHỤC', item => item['Trang phục']],
            ['QUYỀN LỢI', item => item['Quyền lợi']],
            ['HẠN ĐĂNG KÝ', item => item['Hạn đăng ký']],
            ['LINK ĐĂNG KÝ', item => item['Link đăng ký']],
            ['LINK NHÓM', item => item['Link nhóm']],
            ['ĐƠN VỊ PHỤ TRÁCH', item => item['Đơn vị phụ trách']],
            ['TRẠNG THÁI', item => item['Trạng thái']],
            ['LOẠI', item => item['Loại']],
            ['GHI CHÚ', item => item['Ghi chú']]
        ];

        const header = columns.map(([title]) => `<th>${htmlEscape(title)}</th>`).join('');
        const body = items.map((item, idx) => '<tr>' + columns.map(([, getter]) => `<td>${htmlEscape(getter(item, idx))}</td>`).join('') + '</tr>').join('');
        const html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
            <head><meta charset="UTF-8">
            <style>
                table { border-collapse: collapse; font-family: Times New Roman, Arial, sans-serif; }
                th, td { border: 1px solid #000; padding: 6px; vertical-align: middle; mso-number-format:'\\@'; }
                th { font-weight: bold; text-align: center; background: #f2f2f2; }
                td:nth-child(1), td:nth-child(3), td:nth-child(5) { text-align: center; }
            
/* ==================== LUXURY / TRANG TRỌNG UI OVERRIDE ==================== */
:root{
    --luxury-navy:#071827;
    --luxury-navy-2:#0f2a44;
    --luxury-blue:#123a63;
    --luxury-gold:#c9a24a;
    --luxury-gold-soft:#f6edd4;
    --luxury-cream:#fbfaf7;
    --luxury-line:#d8dee8;
    --bg-body:#f5f7fb;
    --bg-card:#ffffff;
    --bg-toolbar:rgba(255,255,255,.96);
    --bg-meta:#f7f9fc;
    --it-navy:#0f2a44;
    --it-blue:#1d4f7a;
    --it-green:#0f766e;
    --text-main:#172033;
    --text-muted:#667085;
    --border-color:#dde3ec;
    --border-hover:#b7c3d4;
    --radius:12px;
    --shadow-sm:0 2px 10px rgba(7,24,39,.06);
    --shadow-md:0 12px 32px rgba(7,24,39,.09);
    --shadow-lg:0 24px 60px rgba(7,24,39,.16);
}

[data-theme="dark"]{
    --luxury-navy:#eaf0f7;
    --luxury-navy-2:#d9e8f8;
    --luxury-blue:#8db7e8;
    --luxury-gold:#d7b765;
    --luxury-gold-soft:#382f1a;
    --luxury-cream:#0b1220;
    --bg-body:#07111f;
    --bg-card:#0f1c2d;
    --bg-toolbar:rgba(15,28,45,.96);
    --bg-meta:#15263a;
    --it-navy:#d9e8f8;
    --it-blue:#8db7e8;
    --it-green:#6ee7b7;
    --text-main:#f2f6fb;
    --text-muted:#aab7c8;
    --border-color:#24364d;
    --border-hover:#38536f;
}

body{
    background:
        radial-gradient(circle at top left, rgba(201,162,74,.11), transparent 34%),
        linear-gradient(180deg,#f7f9fc 0%,#eef3f8 100%);
    color:var(--text-main);
}

[data-theme="dark"] body{
    background:
        radial-gradient(circle at top left, rgba(201,162,74,.12), transparent 32%),
        linear-gradient(180deg,#07111f 0%,#0d1726 100%);
}

.hero{
    background:
        linear-gradient(135deg, rgba(7,24,39,.96) 0%, rgba(15,42,68,.96) 58%, rgba(39,54,75,.96) 100%),
        radial-gradient(circle at 18% 18%, rgba(201,162,74,.24), transparent 26%);
    padding:62px 20px 104px;
    border-bottom:5px solid var(--luxury-gold);
    box-shadow:0 16px 44px rgba(7,24,39,.22);
}

.hero::before{
    content:"";
    position:absolute;
    inset:0;
    background:
        linear-gradient(90deg, transparent, rgba(255,255,255,.07), transparent),
        repeating-linear-gradient(135deg, rgba(255,255,255,.04) 0 1px, transparent 1px 12px);
    pointer-events:none;
    opacity:.55;
}

.logo-doan{
    position:relative;
    max-width:980px;
    margin:0 auto;
}

.logo-doan::before{
    content:"";
    display:block;
    width:78px;
    height:3px;
    margin:0 auto 18px;
    background:linear-gradient(90deg, transparent, var(--luxury-gold), transparent);
    border-radius:999px;
}

.hero h1{
    font-family:"Plus Jakarta Sans",sans-serif;
    color:#fff;
    text-transform:uppercase;
    letter-spacing:.055em;
    font-size:clamp(1.35rem,3vw,2.18rem);
    font-weight:800;
    text-shadow:0 10px 28px rgba(0,0,0,.28);
}

.hero h1 + h1{
    color:#f4d98c;
    font-size:clamp(1.05rem,2.35vw,1.7rem);
    letter-spacing:.08em;
    margin-top:6px;
}

.stats-badge{
    position:relative;
    background:rgba(255,255,255,.10);
    border:1px solid rgba(244,217,140,.45);
    color:#fff7df;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.12), 0 12px 32px rgba(0,0,0,.18);
}

.container{
    max-width:1360px;
}

.toolbar{
    border-radius:18px;
    border:1px solid rgba(216,222,232,.92);
    box-shadow:0 18px 50px rgba(7,24,39,.10);
    backdrop-filter:blur(14px);
}

.toolbar::before{
    content:"";
    position:absolute;
    top:0;
    left:0;
    right:0;
    height:4px;
    background:linear-gradient(90deg, var(--luxury-gold), #f1d58a, var(--luxury-gold));
    border-radius:18px 18px 0 0;
}

.theme-toggle{
    border-radius:10px;
    border:1px solid var(--border-color);
    color:var(--luxury-navy-2);
    box-shadow:var(--shadow-sm);
}

.filter-tabs{
    padding-right:62px;
}

.tab-btn{
    border-radius:10px;
    border:1px solid var(--border-color);
    background:#f8fafc;
    color:#46566b;
    font-weight:800;
    letter-spacing:.01em;
    box-shadow:none;
}

[data-theme="dark"] .tab-btn{
    background:#132238;
    color:#b9c7d8;
}

.tab-btn:hover{
    border-color:var(--luxury-gold);
    color:var(--luxury-navy-2);
    transform:translateY(-1px);
}

.tab-btn.active{
    background:linear-gradient(135deg,var(--luxury-navy),var(--luxury-navy-2));
    border-color:var(--luxury-gold);
    color:#fff;
    box-shadow:0 10px 24px rgba(7,24,39,.18);
}

.search-box input,
.month-picker{
    border-radius:10px;
    border:1px solid var(--border-color);
    background:var(--bg-card);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.4);
}

.search-box input:focus,
.month-picker:focus{
    border-color:var(--luxury-gold);
    box-shadow:0 0 0 4px rgba(201,162,74,.14);
}

.export-btn{
    border-radius:10px;
    background:linear-gradient(135deg,#0f766e,#115e59);
    border:1px solid rgba(15,118,110,.7);
    box-shadow:0 10px 22px rgba(15,118,110,.18);
}

.grid{
    gap:22px;
}

.card{
    border-radius:16px;
    border:1px solid var(--border-color);
    box-shadow:0 10px 28px rgba(7,24,39,.07);
    background:var(--bg-card);
}

.card::after{
    content:"";
    position:absolute;
    inset:0;
    border-radius:16px;
    pointer-events:none;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.58);
}

.card:hover{
    transform:translateY(-5px);
    box-shadow:0 22px 48px rgba(7,24,39,.13);
    border-color:rgba(201,162,74,.55);
}

.card.contest,
.card.workshop,
.card.activity{
    border-left:0;
}

.card.contest::before,
.card.workshop::before,
.card.activity::before,
.card.closed::before{
    content:"";
    position:absolute;
    top:0;
    left:0;
    right:0;
    height:4px;
}

.card.contest::before{background:linear-gradient(90deg,#c9a24a,#f0d485);}
.card.workshop::before{background:linear-gradient(90deg,#123a63,#49769f);}
.card.activity::before{background:linear-gradient(90deg,#0f766e,#6ee7b7);}
.card.closed::before{background:#94a3b8;}

.card-head{
    padding:24px 24px 10px;
}

.type-tag{
    border-radius:999px;
    font-size:.68rem;
    letter-spacing:.07em;
    border:1px solid currentColor;
    background:transparent!important;
}

.status-tag{
    border-radius:999px;
    border:1px solid currentColor;
    background:transparent!important;
}

.card-title{
    color:var(--luxury-navy-2);
    font-size:1.06rem;
    line-height:1.55;
    letter-spacing:-.01em;
}

[data-theme="dark"] .card-title{
    color:#f2f6fb;
}

.meta-row{
    border:1px solid var(--border-color);
    background:var(--bg-meta);
    border-radius:12px;
}

.meta-row i{
    color:var(--luxury-gold);
}

.meta-text b{
    color:var(--text-muted);
    letter-spacing:.06em;
}

.card-foot{
    border-top:1px solid var(--border-color);
    background:linear-gradient(180deg,transparent,rgba(248,250,252,.72));
}

[data-theme="dark"] .card-foot{
    background:linear-gradient(180deg,transparent,rgba(15,28,45,.55));
}

.btn{
    border-radius:10px;
    font-weight:800;
}

.btn-reg{
    background:linear-gradient(135deg,var(--luxury-navy),var(--luxury-navy-2));
    border:1px solid rgba(201,162,74,.32);
    box-shadow:0 10px 22px rgba(7,24,39,.17);
}

.btn-reg:hover{
    background:linear-gradient(135deg,#123a63,#071827);
}

.btn-detail,
.btn-share{
    border:1px solid var(--border-color);
    background:var(--bg-card);
}

.btn-group{
    background:linear-gradient(135deg,#0f766e,#115e59);
}

.pagination{
    margin-top:42px;
}

.p-btn{
    border-radius:10px;
    border:1px solid var(--border-color);
    color:var(--luxury-navy-2);
    box-shadow:var(--shadow-sm);
}

.p-btn.active{
    background:linear-gradient(135deg,var(--luxury-navy),var(--luxury-navy-2));
    border-color:var(--luxury-gold);
}

.modal{
    background:rgba(7,24,39,.72);
}

.modal-box{
    border-radius:18px;
    border:1px solid rgba(201,162,74,.25);
    box-shadow:0 32px 80px rgba(0,0,0,.32);
    background:var(--bg-modal);
}

.modal-h{
    background:linear-gradient(135deg,var(--luxury-navy),var(--luxury-navy-2));
    color:#fff;
    border-bottom:4px solid var(--luxury-gold);
}

.modal-b{
    background:var(--bg-modal);
}

.m-item{
    background:var(--bg-meta);
    border-left:4px solid var(--luxury-gold);
    border:1px solid var(--border-color);
    border-left-width:4px;
}

.footer{
    background:linear-gradient(135deg,#071827,#0f2a44);
    border-top:4px solid var(--luxury-gold);
    box-shadow:0 -14px 44px rgba(7,24,39,.18);
}

.footer a{
    color:#f4d98c;
}

.chatbot-toggle{
    background:linear-gradient(135deg,#0f2a44,#c9a24a);
    box-shadow:0 18px 40px rgba(7,24,39,.24);
}

.chatbot-panel{
    border-radius:18px;
    border:1px solid rgba(201,162,74,.32);
}

.chatbot-header{
    background:linear-gradient(135deg,#071827,#0f2a44);
    border-bottom:3px solid var(--luxury-gold);
}

.chatbot-form button{
    background:linear-gradient(135deg,#071827,#0f2a44);
}

#toast{
    background:linear-gradient(135deg,#0f766e,#115e59);
}

.visitor-badge-wrap{
    text-align:center;
    margin:14px 0 0;
}

.visitor-badge-wrap img{
    max-width:100%;
    height:auto;
}

body > img[src*="visitorbadge"]{
    display:block;
    margin:14px auto 22px;
}

@media(max-width:640px){
    .hero{
        padding:42px 14px 86px;
    }

    .toolbar{
        padding:18px;
    }

    .filter-tabs{
        padding-right:0;
        margin-top:56px;
    }

    .theme-toggle{
        top:18px;
        right:18px;
    }

    .hero h1{
        font-size:1.1rem;
    }

    .hero h1 + h1{
        font-size:.96rem;
    }
}

</style></head>
            <body>
                <table>
                    <tr><th colspan="${columns.length}">DANH SÁCH HOẠT ĐỘNG THÁNG ${parseInt(mm, 10)}/2026</th></tr>
                    <tr>${header}</tr>
                    ${body}
                </table>
            </body></html>`;

        const blob = new Blob(['\ufeff', html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `danh_sach_hoat_dong_thang_${mm}_2026.xls`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        return items.length;
    }

    function exportMonthFromSelect() {
        const month = document.getElementById('monthFilter').value;
        if (month === 'ALL') {
            alert('Bạn hãy chọn một tháng trước khi xuất file.');
            return;
        }
        const total = exportMonthFile(month);
        if (total) {
            const t = document.getElementById('toast');
            t.innerText = `✅ Đã xuất ${total} hoạt động tháng ${parseInt(month, 10)}`;
            t.style.display = 'block';
            setTimeout(() => { t.style.display = 'none'; t.innerText = '✅ Đã sao chép nội dung chia sẻ!'; }, 2500);
        }
    }

    function detectMonthFromQuestion(question) {
        const q = normalizeText(question);
        let m = q.match(/thang\s*(\d{1,2})/);
        if (!m) m = q.match(/\b(?:t|th)\s*(\d{1,2})\b/);
        if (!m) m = q.match(/\/(\d{1,2})\b/);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        return (n >= 1 && n <= 12) ? String(n).padStart(2, '0') : null;
    }

    function normalizeActivityType(item) {
        const type = normalizeText(item['Loại']);
        const name = normalizeText(item['Tên chương trình']);
        if (type.includes('workshop')) return 'Workshop';
        if (type.includes('cuoc thi')) return 'Cuộc thi';
        if (name.includes('talkshow')) return 'Khác (Talkshow)';
        if (name.includes('giao luu van hoa') || name.includes('indonesia') || name.includes('han quoc') || name.includes('lao') || name.includes('campuchia')) return 'Giao lưu văn hóa';
        return 'Hoạt động CTXH, hỗ trợ, sự kiện';
    }

    function toggleChatbot(force) {
        const panel = document.getElementById('chatbotPanel');
        const open = typeof force === 'boolean' ? force : !panel.classList.contains('open');
        panel.classList.toggle('open', open);
        if (open) applySuggestionState();
        if (open && !document.getElementById('chatMessages').dataset.started) {
            document.getElementById('chatMessages').dataset.started = '1';
            addChatMessage('bot', 'Chào bạn! Mình có thể trả lời theo dữ liệu bảng: hoạt động đang mở, sắp hết hạn, link đăng ký, link nhóm, địa điểm, thời gian, hạn đăng ký, quyền lợi CTXH, trang phục, đơn vị phụ trách. Khi mình trả về danh sách, bạn bấm vào từng thẻ để xem chi tiết.');
        }
    }

    function applySuggestionState() {
        const suggestions = document.getElementById('chatSuggestions');
        const btn = document.getElementById('suggestionToggleBtn');
        if (!suggestions || !btn) return;
        const hidden = localStorage.getItem('hideChatSuggestions') === '1';
        suggestions.classList.toggle('hidden', hidden);
        btn.innerText = hidden ? 'Hiện gợi ý' : 'Ẩn gợi ý';
        btn.title = hidden ? 'Hiện phần gợi ý câu hỏi' : 'Ẩn phần gợi ý câu hỏi';
    }

    function toggleSuggestions() {
        const hidden = localStorage.getItem('hideChatSuggestions') === '1';
        localStorage.setItem('hideChatSuggestions', hidden ? '0' : '1');
        applySuggestionState();
    }

    document.addEventListener('DOMContentLoaded', applySuggestionState);

    let chatActivityStore = [];

    function addChatMessage(role, content) {
        const box = document.getElementById('chatMessages');
        const row = document.createElement('div');
        row.className = `chat-msg ${role}`;
        const bubble = document.createElement('div');
        bubble.className = 'chat-bubble';

        if (content && typeof content === 'object' && content.html) {
            bubble.innerHTML = content.html;
            bubble.classList.add('has-rich-content');
        } else {
            bubble.textContent = content;
        }

        row.appendChild(bubble);
        box.appendChild(row);
        box.scrollTop = box.scrollHeight;
    }

    function askBot(text) {
        document.getElementById('chatInput').value = text;
        sendChat();
    }

    function sendChat(event) {
        if (event) event.preventDefault();
        const input = document.getElementById('chatInput');
        const question = input.value.trim();
        if (!question) return;
        addChatMessage('user', question);
        input.value = '';
        setTimeout(() => addChatMessage('bot', getBotReply(question)), 120);
    }

    const STOP_WORDS = new Set([
        'cho','minh','hoi','hoi','co','khong','khong','nhung','cac','cua','va','la','ve','the','nao','bao','nhieu',
        'thang','nam','ngay','hoat','dong','chuong','trinh','dang','ky','link','thoi','gian','dia','diem','quyen','loi',
        'trang','phuc','han','deadline','ctxh','cong','gio','danh','sach','thong','ke','tong','hop','tim','kiem','neu','giup'
    ]);

    function countDeclaredStudents(items) {
        return items.reduce((sum, item) => {
            const s = (item['Số lượng'] || '').toString().replace(/\./g, '');
            if (!s || /\/bu[oổ]i|m[oỗ]i/i.test(s)) return sum;
            const nums = [...s.matchAll(/\d+/g)].map(x => parseInt(x[0], 10)).filter(Number.isFinite);
            return nums.length ? sum + Math.max(...nums) : sum;
        }, 0);
    }

    function getItemText(item) {
        return normalizeText(Object.values(item || {}).join(' '));
    }

    function getQuestionKeywords(question) {
        const q = normalizeText(question);
        return q.split(/[^a-z0-9]+/)
            .map(w => w.trim())
            .filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    }

    function scoreItemByQuestion(item, question) {
        const keywords = getQuestionKeywords(question);
        if (!keywords.length) return 0;
        const name = normalizeText(item['Tên chương trình']);
        const all = getItemText(item);
        let score = 0;
        keywords.forEach(w => {
            if (name.includes(w)) score += 4;
            else if (all.includes(w)) score += 1;
        });
        return score;
    }

    function searchActivities(question, baseItems = db) {
        const scored = baseItems
            .map(item => ({ item, score: scoreItemByQuestion(item, question) }))
            .filter(x => x.score > 0)
            .sort((a, b) => b.score - a.score);
        return scored.map(x => x.item);
    }

    function detectIntent(question) {
        const q = normalizeText(question);
        if (/\b(help|huong dan|hoi duoc gi|ban co the)\b/.test(q)) return 'help';
        if (/\b(thong ke|tong hop|bao cao|phan tich|bao nhieu|so luong|dem|tong cong)\b/.test(q)) return 'stats';
        if (/\b(link nhom|nhom zalo|zalo)\b/.test(q)) return 'groupLink';
        if (/\b(link|dang ky|form|bieu mau)\b/.test(q)) return 'registerLink';
        if (/\b(sap het han|gan het han|deadline gan|han gan|han sap toi)\b/.test(q)) return 'upcomingDeadline';
        if (/\b(han dang ky|deadline|het han khi nao|han chot)\b/.test(q)) return 'deadline';
        if (/\b(dia diem|o dau|tai dau|cho nao)\b/.test(q)) return 'location';
        if (/\b(thoi gian|lich|khi nao|may gio|ngay nao|luc nao)\b/.test(q)) return 'time';
        if (/\b(trang phuc|mac gi|dong phuc)\b/.test(q)) return 'clothes';
        if (/\b(quyen loi|ctxh|cong tac xa hoi|ren luyen|diem|gio)\b/.test(q)) return 'benefit';
        if (/\b(don vi|phu trach|to chuc|ai phu trach)\b/.test(q)) return 'unit';
        if (/\b(con mo|dang mo|con han|chua dong|dang tuyen)\b/.test(q)) return 'open';
        if (/\b(het han|da dong|ngung|dong roi)\b/.test(q)) return 'closed';
        if (/\b(goi y|nen tham gia|phu hop|noi bat|co ctxh|ctxh)\b/.test(q)) return 'recommend';
        return 'search';
    }

    function filterByQuestion(question, items = db) {
        const q = normalizeText(question);
        let results = [...items];
        const month = detectMonthFromQuestion(question);
        if (month) results = results.filter(i => activityHasMonth(i, month));

        const intent = detectIntent(question);
        if (/\b(con mo|dang mo|con han|chua dong|dang tuyen)\b/.test(q)) results = results.filter(i => !isClosed(i['Trạng thái']));
        if (intent !== 'upcomingDeadline' && /\b(het han|da dong|ngung|dong roi)\b/.test(q)) results = results.filter(i => isClosed(i['Trạng thái']));
        if (q.includes('workshop')) results = results.filter(i => normalizeText(i['Loại']).includes('workshop') || normalizeText(i['Tên chương trình']).includes('workshop'));
        else if (q.includes('cuoc thi') || q.includes('contest')) results = results.filter(i => normalizeText(i['Loại']).includes('cuoc thi') || normalizeText(i['Tên chương trình']).includes('cuoc thi'));
        else if (q.includes('talkshow')) results = results.filter(i => normalizeText(i['Tên chương trình']).includes('talkshow') || normalizeText(i['Loại']).includes('talkshow'));
        else if (q.includes('tinh nguyen') || q.includes('thien nguyen')) results = results.filter(i => normalizeText(i['Loại']).includes('tinh nguyen') || normalizeText(i['Tên chương trình']).includes('tinh nguyen') || normalizeText(i['Tên chương trình']).includes('thien nguyen'));

        if (q.includes('ctxh') || q.includes('cong tac xa hoi')) {
            results = results.filter(i => normalizeText(i['Quyền lợi']).includes('ctxh') || normalizeText(i['Quyền lợi']).includes('cong tac xa hoi'));
        }

        const keywordResults = searchActivities(question, results);
        const shouldKeywordFilter = getQuestionKeywords(question).length > 0 && !['stats','open','closed','recommend','upcomingDeadline'].includes(intent);
        if (shouldKeywordFilter && keywordResults.length) results = keywordResults;
        return { results, month };
    }

    function normalizeActivityType(item) {
        const type = normalizeText(item['Loại']);
        const name = normalizeText(item['Tên chương trình']);
        if (type.includes('workshop')) return 'Workshop';
        if (type.includes('cuoc thi')) return 'Cuộc thi';
        if (type.includes('talkshow') || name.includes('talkshow')) return 'Khác (Talkshow)';
        if (name.includes('giao luu van hoa') || name.includes('indonesia') || name.includes('han quoc') || name.includes('lao') || name.includes('campuchia')) return 'Giao lưu văn hóa';
        return 'Hoạt động CTXH, hỗ trợ, sự kiện';
    }

    function botHtml(html) {
        return { html };
    }

    function safeHref(value) {
        const url = (value || '').toString().trim();
        if (!url) return '';
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return '';
            return htmlEscape(parsed.href);
        } catch (_) {
            return '';
        }
    }

    function shortText(value, max = 90) {
        const text = (value || '').toString().trim();
        if (!text) return 'Chưa cập nhật';
        return text.length > max ? text.slice(0, max - 1) + '…' : text;
    }

    function registerChatActivity(item) {
        chatActivityStore.push(item);
        return chatActivityStore.length - 1;
    }

    function openChatActivity(index) {
        const item = chatActivityStore[index];
        if (item) showM(item);
    }

    function chatResultCard(item, field, label) {
        const id = registerChatActivity(item);
        const closed = isClosed(item['Trạng thái']);
        const title = htmlEscape(item['Tên chương trình'] || 'Hoạt động chưa có tên');
        const type = htmlEscape((item['Loại'] || 'HOẠT ĐỘNG').toString().toUpperCase());
        const time = htmlEscape(shortText(item['Thời gian']));
        const place = htmlEscape(shortText(item['Địa điểm']));
        const deadline = htmlEscape(shortText(item['Hạn đăng ký']));
        const benefit = htmlEscape(shortText(item['Quyền lợi']));
        const registerLink = safeHref(item['Link đăng ký']);
        const groupLink = safeHref(item['Link nhóm']);
        const valueHtml = field
            ? `<div class="chat-result-value"><b>${htmlEscape(label)}</b><span>${htmlEscape(shortText(item[field], 160))}</span></div>`
            : `<div class="chat-result-meta">⏰ ${time}</div><div class="chat-result-meta">📍 ${place}</div><div class="chat-result-meta">🎁 ${benefit}</div>`;
        const linkHtml = registerLink && !closed
            ? `<a class="chat-mini-link primary" href="${registerLink}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"><i class="fas fa-link"></i> Đăng ký</a>`
            : '';
        const groupHtml = groupLink && !closed
            ? `<a class="chat-mini-link" href="${groupLink}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()"><i class="fas fa-users"></i> Nhóm</a>`
            : '';
        return `
            <div class="chat-result-card" role="button" tabindex="0" onclick="openChatActivity(${id})" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openChatActivity(${id});}">
                <div class="chat-result-topline">
                    <div class="chat-result-title">${title}</div>
                    <span class="chat-result-status ${closed ? 'closed' : ''}">${closed ? 'Đã đóng' : 'Đang mở'}</span>
                </div>
                <div class="chat-result-meta">🏷️ ${type} · Hạn: ${deadline}</div>
                ${valueHtml}
                <div class="chat-result-actions">
                    <button type="button" class="chat-mini-btn" onclick="event.stopPropagation();openChatActivity(${id})"><i class="fas fa-circle-info"></i> Xem chi tiết</button>
                    ${linkHtml}
                    ${groupHtml}
                </div>
            </div>`;
    }

    function chatListReply(items, title, limit = 8, field = null, label = '') {
        if (!items.length) {
            return botHtml(`<div class="chat-answer-head"><strong>${htmlEscape(title)}</strong><p>Chưa tìm thấy dữ liệu phù hợp. Bạn thử hỏi ngắn hơn, ví dụ: “đang mở”, “có CTXH”, “link đăng ký”.</p></div>`);
        }
        const shown = items.slice(0, limit);
        const more = items.length > limit ? `Còn ${items.length - limit} hoạt động khác. Bạn có thể hỏi cụ thể hơn theo tên, loại hoặc quyền lợi.` : 'Bấm vào thẻ để xem đầy đủ thông tin.';
        return botHtml(`
            <div class="chat-answer-head">
                <strong>${htmlEscape(title)}: ${items.length} hoạt động</strong>
                <p>${htmlEscape(more)}</p>
            </div>
            <div class="chat-result-list">${shown.map(i => chatResultCard(i, field, label)).join('')}</div>
        `);
    }

    function parseAnyDate(value) {
        const text = (value || '').toString();
        let match = text.match(/\b(\d{1,2})\s*[\/-]\s*(\d{1,2})(?:\s*[\/-]\s*(\d{2,4}))?\b/);
        if (!match) return null;
        let year = match[3] || new Date().getFullYear().toString();
        if (year.length === 2) year = '20' + year;
        const d = parseInt(match[1], 10), m = parseInt(match[2], 10), y = parseInt(year, 10);
        if (!Number.isFinite(d) || !Number.isFinite(m) || !Number.isFinite(y) || d < 1 || d > 31 || m < 1 || m > 12) return null;
        return new Date(y, m - 1, d, 23, 59, 59);
    }

    function upcomingDeadlineItems(items) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const open = items.filter(i => !isClosed(i['Trạng thái']));
        const withDate = open
            .map(item => ({ item, date: parseAnyDate(item['Hạn đăng ký']) || parseAnyDate(item['Thời gian']) }))
            .filter(x => x.date && x.date >= today)
            .sort((a, b) => a.date - b.date)
            .map(x => x.item);
        return withDate.length ? withDate : open;
    }

    function buildStatsReply(title, items) {
        if (!items.length) return botHtml(`<div class="chat-answer-head"><strong>${htmlEscape(title)}</strong><p>Chưa tìm thấy dữ liệu phù hợp.</p></div>`);
        const counts = {};
        items.forEach(i => {
            const key = normalizeActivityType(i);
            counts[key] = (counts[key] || 0) + 1;
        });
        const open = items.filter(i => !isClosed(i['Trạng thái'])).length;
        const closed = items.length - open;
        const ctxh4 = items.filter(i => /(^|\D)4\s*(h|gio|giờ)/i.test((i['Quyền lợi'] || '').toString())).length;
        const ctxh8 = items.filter(i => /(^|\D)8\s*(h|gio|giờ)/i.test((i['Quyền lợi'] || '').toString())).length;
        const ctxhLarge = items.filter(i => /(10|12|16)\s*(h|gio|giờ)/i.test((i['Quyền lợi'] || '').toString())).length;
        const totalStudents = countDeclaredStudents(items);
        const typeSummary = Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 4).map(([k,v]) => `${k}: ${v}`).join(' · ');
        const topItems = items.slice(0, 5);
        return botHtml(`
            <div class="chat-answer-head">
                <strong>${htmlEscape(title)}: ${items.length} hoạt động</strong>
                <p>${htmlEscape(typeSummary || 'Chưa đủ dữ liệu phân loại')}. Bấm vào các thẻ bên dưới để xem chi tiết.</p>
                <div class="chat-stat-grid">
                    <div class="chat-stat-box"><b>${open}</b><span>Đang mở</span></div>
                    <div class="chat-stat-box"><b>${closed}</b><span>Đã đóng/ngưng</span></div>
                    <div class="chat-stat-box"><b>${ctxh4 + ctxh8 + ctxhLarge}</b><span>Có CTXH đọc được</span></div>
                    <div class="chat-stat-box"><b>${totalStudents || '—'}</b><span>Chỉ tiêu SV ghi rõ</span></div>
                </div>
            </div>
            <div class="chat-result-list">${topItems.map(i => chatResultCard(i)).join('')}</div>
        `);
    }

    function briefList(items, title, limit = 10) {
        return chatListReply(items, title, limit);
    }

    function fieldReply(items, field, label) {
        return chatListReply(items, label, 8, field, label);
    }

    function recommendReply(items) {
        if (!items.length) return botHtml(`<div class="chat-answer-head"><strong>Gợi ý hoạt động</strong><p>Mình chưa có dữ liệu phù hợp để gợi ý.</p></div>`);
        const openItems = items.filter(i => !isClosed(i['Trạng thái']));
        const base = openItems.length ? openItems : items;
        const ctxh = base.filter(i => normalizeText(i['Quyền lợi']).includes('ctxh') || normalizeText(i['Quyền lợi']).includes('cong tac xa hoi'));
        const selected = (ctxh.length ? ctxh : base).slice(0, 8);
        return chatListReply(selected, openItems.length ? 'Gợi ý hoạt động còn mở/ưu tiên có CTXH' : 'Gợi ý hoạt động theo dữ liệu hiện có', 8);
    }

    function helpReply() {
        const samples = [
            ['Hoạt động đang mở', 'Đang mở'],
            ['Hoạt động sắp hết hạn', 'Sắp hết hạn'],
            ['Hoạt động có CTXH', 'Có CTXH'],
            ['Link đăng ký các hoạt động', 'Link đăng ký'],
            ['Workshop đang mở', 'Workshop'],
            ['Cuộc thi đang mở', 'Cuộc thi'],
            ['Tình nguyện đang mở', 'Tình nguyện'],
            ['Hạn đăng ký các hoạt động', 'Hạn đăng ký']
        ];
        return botHtml(`
            <div class="chat-answer-head">
                <strong>Bạn có thể hỏi theo các nhóm chung</strong>
                <p>Không cần ghi tháng cụ thể. Khi có danh sách trả về, bấm vào từng thẻ để mở cửa sổ chi tiết.</p>
                <div class="chat-help-grid">
                    ${samples.map(([q, label]) => `<button class="chat-help-btn" onclick="event.stopPropagation();askBot('${htmlEscape(q)}')">${htmlEscape(label)}</button>`).join('')}
                </div>
            </div>
        `);
    }

    function getBotReply(question) {
        if (!db.length) return 'Dữ liệu chưa tải xong. Bạn hỏi lại sau vài giây nhé.';
        const intent = detectIntent(question);
        if (intent === 'help') return helpReply();

        if (intent === 'export') {
            const exportMonth = detectMonthFromQuestion(question);
            if (!exportMonth) return 'Bạn muốn xuất tháng mấy? Ví dụ: “Xuất file tháng 7”.';
            const total = exportMonthFile(exportMonth);
            return total ? `Mình đã xuất file Excel tháng ${parseInt(exportMonth, 10)} gồm ${total} hoạt động, sắp xếp từ đầu tháng đến cuối tháng.` : `Không tìm thấy dữ liệu tháng ${parseInt(exportMonth, 10)} để xuất file.`;
        }

        const q = normalizeText(question);
        const { results, month } = filterByQuestion(question);

        // Hỏi riêng theo số giờ CTXH, ví dụ: "hoạt động cộng 8 giờ ctxh"
        const hourMatch = q.match(/(\d{1,2})\s*(h|gio|giờ)/);
        if (hourMatch) {
            const h = hourMatch[1];
            const matched = results.filter(i => new RegExp(`(^|\\D)${h}\\s*(h|gio|giờ)`, 'i').test((i['Quyền lợi'] || '').toString()));
            return briefList(matched, `Hoạt động có quyền lợi khoảng ${h} giờ CTXH`);
        }

        if (intent === 'stats') {
            const title = month ? `Thống kê tháng ${parseInt(month, 10)}` : 'Thống kê toàn bộ dữ liệu';
            return buildStatsReply(title, results);
        }
        if (intent === 'upcomingDeadline') return chatListReply(upcomingDeadlineItems(results), month ? `Hoạt động sắp hết hạn trong tháng ${parseInt(month, 10)}` : 'Hoạt động sắp hết hạn', 8, 'Hạn đăng ký', 'Hạn đăng ký');
        if (intent === 'open') return briefList(results.filter(i => !isClosed(i['Trạng thái'])), month ? `Hoạt động còn mở trong tháng ${parseInt(month, 10)}` : 'Hoạt động còn mở');
        if (intent === 'closed') return briefList(results.filter(i => isClosed(i['Trạng thái'])), month ? `Hoạt động đã đóng/ngưng trong tháng ${parseInt(month, 10)}` : 'Hoạt động đã đóng/ngưng');
        if (intent === 'recommend') return recommendReply(results);
        if (intent === 'groupLink') return fieldReply(results, 'Link nhóm', 'Link nhóm');
        if (intent === 'registerLink') {
            const openResults = results.filter(i => !isClosed(i['Trạng thái']));
            return fieldReply(openResults.length ? openResults : results, 'Link đăng ký', 'Link đăng ký');
        }
        if (intent === 'deadline') return fieldReply(results, 'Hạn đăng ký', 'Hạn đăng ký');
        if (intent === 'location') return fieldReply(results, 'Địa điểm', 'Địa điểm');
        if (intent === 'time') return fieldReply(results, 'Thời gian', 'Thời gian');
        if (intent === 'clothes') return fieldReply(results, 'Trang phục', 'Trang phục');
        if (intent === 'benefit') return fieldReply(results, 'Quyền lợi', 'Quyền lợi');
        if (intent === 'unit') return fieldReply(results, 'Đơn vị phụ trách', 'Đơn vị phụ trách');

        if (month) return briefList(results, `Các hoạt động tháng ${parseInt(month, 10)}`);
        const searched = searchActivities(question, db);
        if (searched.length) return briefList(searched, 'Kết quả tìm kiếm phù hợp');
        return `Mình chưa hiểu rõ câu hỏi này. Bạn có thể hỏi theo mẫu: "hoạt động đang mở", "sắp hết hạn", "hoạt động có CTXH", "link đăng ký", "địa điểm workshop", hoặc gõ "hướng dẫn" để xem các câu hỏi mình hỗ trợ.`;
    }

    // Theme Toggle Logic
    function initTheme() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = savedTheme || (prefersDark ? 'dark' : 'light');
        applyTheme(theme);
    }

    function toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        applyTheme(newTheme);
        localStorage.setItem('theme', newTheme);
    }

    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        const icon = document.querySelector('#themeToggle i');
        if (theme === 'dark') {
            icon.className = 'fas fa-sun';
            document.getElementById('themeToggle').title = 'Chuyển sang giao diện sáng';
        } else {
            icon.className = 'fas fa-moon';
            document.getElementById('themeToggle').title = 'Chuyển sang giao diện tối';
        }
    }

    function bindStaticDomEvents() {
        document.getElementById('themeToggle')?.addEventListener('click', () => toggleTheme());
        document.querySelectorAll('#typeTabs .tab-btn').forEach(button => {
            button.addEventListener('click', () => setTab(button.dataset.tab || button.textContent.trim().toUpperCase()));
        });
        document.getElementById('searchInput')?.addEventListener('input', onSearch);
        document.getElementById('monthFilter')?.addEventListener('change', onMonth);
        document.querySelector('.export-btn')?.addEventListener('click', exportMonthFromSelect);
        document.getElementById('modalOverlay')?.addEventListener('click', closeM);
        document.getElementById('modalOverlay')?.querySelector('.modal-box')?.addEventListener('click', event => event.stopPropagation());
        document.querySelector('.chatbot-toggle')?.addEventListener('click', () => toggleChatbot());
        document.getElementById('suggestionToggleBtn')?.addEventListener('click', toggleSuggestions);
        document.querySelector('.chatbot-close')?.addEventListener('click', () => toggleChatbot(false));
        document.querySelectorAll('.chat-chip[data-question]').forEach(button => button.addEventListener('click', () => askBot(button.dataset.question || '')));
        document.querySelector('.chatbot-form')?.addEventListener('submit', sendChat);
    }

    // Initialize theme before loading data
    bindStaticDomEvents();
    initTheme();
    load();
