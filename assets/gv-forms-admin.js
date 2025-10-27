/*
 * GV Forms – visual field builder
 * 2025-08-01  (label-colour + form-title controls, hardened)
 */
(function ($) {

  /* ---------------------------------------------------------------------
     HELPERS
  ---------------------------------------------------------------------- */
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])
    );

  const slugify = (s) =>
    String(s || '')
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  let dirty = false;
  const markDirty = () => (dirty = true);

  /* ---------------------------------------------------------------------
     GLOBAL COLOUR PICKERS
  ---------------------------------------------------------------------- */
  const $labelColor = $('#gv-label-color').wpColorPicker();

  // NEW — form title controls
  const $titleText  = $('#gv-title-text');
  const $titleAlign = $('#gv-title-align'); // hidden input storing left|center|right
  const $titleColor = $('#gv-title-color').wpColorPicker();

  // Prefill from localized data (defensive)
  if (window.gvFormsAdmin && gvFormsAdmin.title) {
    if (gvFormsAdmin.title.text != null)  $titleText.val(gvFormsAdmin.title.text);
    if (gvFormsAdmin.title.align)         $titleAlign.val(gvFormsAdmin.title.align);
    if (gvFormsAdmin.title.color)         $('#gv-title-color').val(gvFormsAdmin.title.color).trigger('change');
  }
  // Ensure the correct L/C/R button is highlighted on load
  $('.gv-form-title-controls .gv-align').removeClass('button-primary');
  $('.gv-form-title-controls .gv-align[data-align="' + ($titleAlign.val() || 'left') + '"]')
    .addClass('button-primary');

  // Toggle selected state for L/C/R buttons
  $('.gv-form-title-controls').on('click', '.gv-align', function () {
    const a = $(this).data('align');
    $titleAlign.val(a);
    $(this).addClass('button-primary')
           .siblings('.gv-align').removeClass('button-primary');
    markDirty();
  });

  // Title + color inputs mark dirty
  $('#gv-title-text, #gv-title-color, #gv-label-color').on('change input', markDirty);

  /* ---------------------------------------------------------------------
     FIELD LIST
  ---------------------------------------------------------------------- */
  const list = $('#gv-field-list');

  const defaultField = () => ({
    label: 'New field',
    slug: 'new_field',
    type: 'text',
    required: 0,
    placeholder: ''
  });

  const tpl = (f) => `
    <div class="gv-field">
      <span class="dashicons dashicons-menu drag-handle"></span>

      <input class="label" placeholder="Label" value="${esc(f.label)}">
      <input class="slug"  placeholder="slug"  value="${esc(f.slug)}">

      <select class="type">
        <option value="text"     ${f.type === 'text'     ? 'selected' : ''}>TEXT</option>
        <option value="email"    ${f.type === 'email'    ? 'selected' : ''}>EMAIL</option>
        <option value="textarea" ${f.type === 'textarea' ? 'selected' : ''}>TEXTAREA</option>
      </select>

      <input class="placeholder" placeholder="Placeholder" value="${esc(f.placeholder ?? '')}">

      <label style="white-space:nowrap">
        <input type="checkbox" class="req" ${f.required ? 'checked' : ''}> required
      </label>

      <button class="remove" title="Delete">×</button>
    </div>`;

  let fields = gvFormsAdmin.fields || [];
  const render = () => list.html(fields.map(tpl).join(''));
  render();

  // Any edit in the list marks dirty
  list.on('input change', 'input, select', markDirty);

  // Drag & drop
  list.sortable({
    handle: '.drag-handle',
    placeholder: 'gv-field-placeholder',
    start(e, ui) { ui.placeholder.height(ui.helper.outerHeight()); },
    update() { markDirty(); } // no fragile data shuffling; we read DOM on save
  });

  // Add / remove
  $('#gv-add').on('click', () => {
    fields.push(defaultField());
    render();
    markDirty();
  });
  list.on('click', '.remove', function () {
    $(this).closest('.gv-field').remove();
    markDirty();
  });

  // Auto-slug: if user edits label and slug looks untouched, generate one
  list.on('input', '.label', function () {
    const row  = $(this).closest('.gv-field');
    const $slug = row.find('.slug');
    if (!$slug.data('touched') && !$slug.val().trim()) {
      $slug.val(slugify($(this).val()));
    }
  });
  list.on('input', '.slug', function () { $(this).data('touched', true); });

  /* ---------------------------------------------------------------------
     COLLECT FROM UI
  ---------------------------------------------------------------------- */
  const collect = () => list.children().map(function () {
    const el = $(this);
    let label = el.find('.label').val().trim();
    let slug  = el.find('.slug').val().trim();
    let type  = el.find('.type').val();
    const req = el.find('.req').is(':checked') ? 1 : 0;
    const ph  = el.find('.placeholder').val().trim();

    // Normalize slug + auto-type rules
    slug = slugify(slug || label || 'field');
    if (slug === 'email')   type = 'email';
    if (slug === 'message') type = 'textarea';

    return { label, slug, type, required: req, placeholder: ph };
  }).get();

  // Ensure slug uniqueness (append _2, _3…)
  const dedupeSlugs = (arr) => {
    const used = Object.create(null);
    arr.forEach((f) => {
      let base = f.slug || 'field';
      let s = base;
      let i = 1;
      while (used[s]) s = `${base}_${++i}`;
      used[s] = 1;
      f.slug = s;
    });
    return arr;
  };

  /* ---------------------------------------------------------------------
     SAVE
  ---------------------------------------------------------------------- */
  const $save = $('#gv-save');
  const $msg  = $('#gv-save-msg');

  $('#gv-save').on('click', () => {

    // Collect current UI -> fields array
    fields = dedupeSlugs(collect());

    const payload = {
      action      : 'gv_save_fields',
      nonce       : gvFormsAdmin.nonce,
      fields      : JSON.stringify(fields),
      label_color : $labelColor.val(),           // global label color
      // NEW — form title settings
      title_text  : $titleText.val().trim(),
      title_align : $titleAlign.val(),
      title_color : $('#gv-title-color').val()
    };

    $('.spinner').addClass('is-active');
    $save.prop('disabled', true);
    $msg.text('');

    $.post(gvFormsAdmin.ajaxUrl, payload)
      .done(() => {
        $msg.text('Saved');
        setTimeout(() => $msg.text(''), 1500);
        dirty = false;
      })
      .fail((xhr) => {
        $msg.text(xhr?.responseText || 'Error');
      })
      .always(() => {
        $('.spinner').removeClass('is-active');
        $save.prop('disabled', false);
      });
  });

  /* ---------------------------------------------------------------------
     UNSAVED CHANGES GUARD
  ---------------------------------------------------------------------- */
  window.addEventListener('beforeunload', (e) => {
    if (!dirty) return;
    e.preventDefault();
    e.returnValue = '';
  });

})(jQuery);
