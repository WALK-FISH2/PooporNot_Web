function setupUpdateManager(): void {
  if (!wx.canIUse('getUpdateManager')) {
    return;
  }

  const updateManager = wx.getUpdateManager();

  updateManager.onCheckForUpdate((res) => {
    console.log('是否存在新版本：', res.hasUpdate);
  });

  updateManager.onUpdateReady(() => {
    wx.showModal({
      title: '发现新版本',
      content: '新版本已经准备好，点击确定后将重新启动小程序。',
      showCancel: false,
      confirmText: '立即更新',
      success: (res) => {
        if (res.confirm) {
          updateManager.applyUpdate();
        }
      },
    });
  });

  updateManager.onUpdateFailed(() => {
    wx.showModal({
      title: '更新失败',
      content: '新版本下载失败，请检查网络后重新打开小程序。',
      showCancel: false,
      confirmText: '我知道了',
    });
  });
}

App({
  globalData: {},

  onLaunch() {
    setupUpdateManager();
  },
});