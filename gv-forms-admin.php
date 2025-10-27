<?php
/**
 * GV Forms – Admin (visual builder)
 * File: gv-forms-admin.php
 */

if ( ! defined( 'ABSPATH' ) ) exit;

class GV_Contact_Form_Admin {

    /* -----------------------------
     * Option keys
     * --------------------------- */
    const OPT_FIELDS        = 'gv_forms_fields';
    const OPT_LABEL_COLOR   = 'gv_forms_label_color';

    // New: title settings
    const OPT_TITLE_TEXT    = 'gv_forms_title_text';
    const OPT_TITLE_ALIGN   = 'gv_forms_title_align';  // left|center|right
    const OPT_TITLE_COLOR   = 'gv_forms_title_color';

    /* -----------------------------
     * Boot
     * --------------------------- */
    public function __construct() {
        add_action( 'admin_menu', [ $this, 'menu' ] );
        add_action( 'admin_enqueue_scripts', [ $this, 'assets' ] );

        // AJAX: save builder
        add_action( 'wp_ajax_gv_save_fields', [ $this, 'ajax_save_fields' ] );

        // After activation → redirect once to the builder
        add_action( 'admin_init', [ $this, 'maybe_activation_redirect' ] );
    }

    /* -----------------------------
     * Activation redirect
     * --------------------------- */
    public function maybe_activation_redirect() {
        if ( get_transient( '_gv_forms_activation' ) ) {
            delete_transient( '_gv_forms_activation' );
            if ( current_user_can( 'manage_options' ) && ! isset( $_GET['activate-multi'] ) ) {
                wp_safe_redirect( admin_url( 'admin.php?page=gvforms' ) );
                exit;
            }
        }
    }

    /* -----------------------------
     * Menu (top-level + Builder)
     * --------------------------- */
    public function menu() {
        add_menu_page(
            'GV Forms',
            'GV Forms',
            'manage_options',
            'gvforms',
            [ $this, 'page_builder' ],
            'dashicons-feedback',
            57
        );

        // Keep “Builder” as the main page
        add_submenu_page(
            'gvforms',
            'Builder',
            'Builder',
            'manage_options',
            'gvforms',
            [ $this, 'page_builder' ]
        );
    }

    /* -----------------------------
     * Assets (only on our page)
     * --------------------------- */
    public function assets( $hook ) {
        if ( $hook !== 'toplevel_page_gvforms' && $hook !== 'gvforms_page_gvforms' ) return;

        $base = plugin_dir_url( __FILE__ );

        // CSS
        wp_enqueue_style( 'gv-forms-admin', $base . 'assets/gv-forms-admin.css', [], GV_Contact_Form_Pro::VERSION );
        wp_enqueue_style( 'wp-color-picker' );

        // JS
        wp_enqueue_script( 'jquery-ui-sortable' );
        wp_enqueue_script( 'wp-color-picker' );
        wp_enqueue_script(
            'gv-forms-admin',
            $base . 'assets/gv-forms-admin.js',
            [ 'jquery', 'jquery-ui-sortable', 'wp-color-picker' ],
            GV_Contact_Form_Pro::VERSION,
            true
        );

        // Pass current state to JS
        wp_localize_script( 'gv-forms-admin', 'gvFormsAdmin', [
            'ajaxUrl' => admin_url( 'admin-ajax.php' ),
            'nonce'   => wp_create_nonce( 'gv_forms_admin' ),
            'fields'  => $this->get_fields(),
            'title'   => [
                'text'  => get_option( self::OPT_TITLE_TEXT, '' ),
                'align' => get_option( self::OPT_TITLE_ALIGN, 'left' ),
                'color' => get_option( self::OPT_TITLE_COLOR, '#ffffff' ),
            ],
        ] );
    }

    /* -----------------------------
     * Defaults
     * --------------------------- */
    public function default_fields() {
        return [
            [ 'label' => 'Name',    'slug' => 'name',    'type' => 'text',     'required' => 1, 'placeholder' => 'Your name' ],
            [ 'label' => 'Company', 'slug' => 'company', 'type' => 'text',     'required' => 0, 'placeholder' => 'Company (optional)' ],
            [ 'label' => 'Email',   'slug' => 'email',   'type' => 'email',    'required' => 1, 'placeholder' => 'you@example.com' ],
            [ 'label' => 'Message', 'slug' => 'message', 'type' => 'textarea', 'required' => 1, 'placeholder' => 'How can we help?' ],
        ];
    }

    /* -----------------------------
     * Read fields (for front-end & CSV)
     * --------------------------- */
    public function get_fields() {
        $stored = get_option( self::OPT_FIELDS, [] );
        if ( empty( $stored ) || ! is_array( $stored ) ) return $this->default_fields();
        return $stored;
    }

    /* -----------------------------
     * Builder screen
     * --------------------------- */
    public function page_builder() {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_die( 'Permission denied' );
        }

        $label_color = get_option( self::OPT_LABEL_COLOR, '#ffffff' );
        $title_text  = get_option( self::OPT_TITLE_TEXT, '' );
        $title_align = get_option( self::OPT_TITLE_ALIGN, 'left' );
        $title_color = get_option( self::OPT_TITLE_COLOR, '#ffffff' );
        ?>
        <div class="wrap gv-forms-admin">
            <h1>GV Forms – Builder</h1>
            <p>Drag, edit, save. Then insert the shortcode <code>[gv_contact_form]</code> to the desired page.</p>

            <!-- Global label color -->
            <div class="gv-row" style="margin:12px 0 6px;">
                <label for="gv-label-color" style="display:inline-block;margin-right:8px;font-weight:600;">Label color:</label>
                <input id="gv-label-color" type="text" value="<?php echo esc_attr( $label_color ); ?>">
            </div>

            <!-- NEW: Form Title controls -->
            <div class="gv-form-title-controls" style="margin:12px 0 18px;display:flex;gap:12px;align-items:center">
                <input id="gv-title-text" type="text" placeholder="Form title (optional)" value="<?php echo esc_attr( $title_text ); ?>" class="regular-text" style="flex:1">
                <div class="button-group" role="group" aria-label="Alignment" style="display:flex">
                    <button type="button" class="button gv-align <?php echo $title_align==='left'?'button-primary':''; ?>"  data-align="left"  title="Align left">L</button>
                    <button type="button" class="button gv-align <?php echo $title_align==='center'?'button-primary':''; ?>" data-align="center" title="Align center">C</button>
                    <button type="button" class="button gv-align <?php echo $title_align==='right'?'button-primary':''; ?>" data-align="right" title="Align right">R</button>
                </div>
                <input id="gv-title-align" type="hidden" value="<?php echo esc_attr( $title_align ); ?>">
                <input id="gv-title-color" type="text" value="<?php echo esc_attr( $title_color ); ?>">
            </div>

            <!-- Field list -->
            <div id="gv-field-list" class="gv-field-list"></div>

            <p class="submit">
                <button id="gv-add"  type="button" class="button">Add field</button>
                <button id="gv-save" type="button" class="button button-primary">Save fields</button>
                <span class="spinner" style="float:none;margin:0 8px;"></span>
                <span id="gv-save-msg" style="vertical-align:middle;"></span>
            </p>
        </div>
        <?php
    }

    /* -----------------------------
     * AJAX: save fields + colors + title
     * --------------------------- */
    public function ajax_save_fields() {
        if ( ! current_user_can( 'manage_options' ) ) {
            wp_send_json_error( 'forbidden', 403 );
        }
        if ( ! isset( $_POST['nonce'] ) || ! wp_verify_nonce( $_POST['nonce'], 'gv_forms_admin' ) ) {
            wp_send_json_error( 'bad nonce', 403 );
        }

        // Fields
        $raw = isset( $_POST['fields'] ) ? wp_unslash( $_POST['fields'] ) : '[]';
        $arr = json_decode( $raw, true );
        if ( ! is_array( $arr ) ) $arr = [];

        $clean = [];
        foreach ( $arr as $f ) {
            $label = sanitize_text_field( $f['label'] ?? '' );
            $slug  = sanitize_key( $f['slug'] ?? '' );
            if ( $slug === '' ) $slug = sanitize_key( $label );

            $type  = in_array( $f['type'] ?? 'text', [ 'text', 'email', 'textarea' ], true ) ? $f['type'] : 'text';
            $req   = ! empty( $f['required'] ) ? 1 : 0;
            $ph    = sanitize_text_field( $f['placeholder'] ?? '' );

            // Force email field to have 'email' type if slug is 'email'
            if ( $slug === 'email' ) $type = 'email';

            $clean[] = [
                'label'       => $label ?: ucfirst( $slug ),
                'slug'        => $slug,
                'type'        => $type,
                'required'    => $req,
                'placeholder' => $ph,
            ];
        }
        update_option( self::OPT_FIELDS, $clean, false );

        // Global label color
        $label_color = isset( $_POST['label_color'] ) ? sanitize_hex_color( $_POST['label_color'] ) : '';
        if ( ! $label_color ) $label_color = '#ffffff';
        update_option( self::OPT_LABEL_COLOR, $label_color, false );

        // Title settings
        $title_text  = sanitize_text_field( $_POST['title_text'] ?? '' );
        $title_align = $_POST['title_align'] ?? 'left';
        if ( ! in_array( $title_align, [ 'left', 'center', 'right' ], true ) ) $title_align = 'left';
        $title_color = sanitize_hex_color( $_POST['title_color'] ?? '' );
        if ( ! $title_color ) $title_color = '#ffffff';

        update_option( self::OPT_TITLE_TEXT,  $title_text,  false );
        update_option( self::OPT_TITLE_ALIGN, $title_align, false );
        update_option( self::OPT_TITLE_COLOR, $title_color, false );

        wp_send_json_success( [ 'ok' => 1 ] );
    }
}
