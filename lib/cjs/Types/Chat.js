"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALL_WA_PATCH_NAMES = void 0;
exports.ALL_WA_PATCH_NAMES = [
    'critical_block',
    'critical_unblock_low',
    'regular_high',
    'regular_low',
    'regular'
];

const ReportType = Object.freeze({
    Block: 'block_dialog',
    OverflowMenuBlock: 'overflow_menu_block',
    OverflowMenuReport: 'overflow_menu_report',
    MediaViewer: 'media_viewer',
    MessageMenu: 'message_menu',
    CommunityHome: 'community_home',
    AccountInfoReport: 'account_info_report',
    GroupInfoReport: 'group_info_report',
    GroupSpamBannerReport: 'group_spam_banner_report',
    OneToOneChatSpamBannerReport: '1_1_spam_banner_report',
    BizSpamBannerBlock: 'biz_spam_banner_block',
    ChatListBlock: 'chat_list_block',
    NotificationBlock: 'notification_block',
    StatusPostReport: 'status_post_report',
    NewsletterInfoReport: 'newsletter_info_report'
});
exports.ReportType = ReportType;
