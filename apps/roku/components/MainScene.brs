sub init()
    m.activationLayer = m.top.FindNode("activationLayer")
    m.homeLayer = m.top.FindNode("homeLayer")
    m.keyboard = m.top.FindNode("codeKeyboard")
    m.activateButton = m.top.FindNode("activateButton")
    m.statusLabel = m.top.FindNode("statusLabel")
    m.activateTask = m.top.FindNode("activateTask")

    m.activateButton.ObserveField("buttonSelected", "onActivateSelected")
    m.activateTask.ObserveField("result", "onActivationResult")
    m.activateTask.ObserveField("error", "onActivationError")

    registry = CreateObject("roRegistrySection", "lc_play")
    if registry.Exists("device_token") then
        showHome(registry.Read("device_name"))
    else
        m.keyboard.SetFocus(true)
    end if
end sub

sub onActivateSelected()
    code = m.keyboard.text
    if Len(code) < 8 then
        m.statusLabel.text = "Informe uma chave válida."
        m.keyboard.SetFocus(true)
        return
    end if

    m.statusLabel.color = "0x9AA3B2FF"
    m.statusLabel.text = "Ativando..."
    deviceInfo = CreateObject("roDeviceInfo")
    m.activateTask.request = {
        code: code
        platform: "ROKU"
        platformDeviceId: deviceInfo.GetChannelClientId()
        model: deviceInfo.GetModelDisplayName()
        osVersion: deviceInfo.GetVersion()
        appVersion: "0.1.0"
    }
    m.activateTask.control = "RUN"
end sub

sub onActivationResult()
    result = m.activateTask.result
    if result = invalid then return

    registry = CreateObject("roRegistrySection", "lc_play")
    registry.Write("device_token", result.deviceToken)
    registry.Write("device_name", result.displayName)
    registry.Flush()
    showHome(result.displayName)
end sub

sub onActivationError()
    m.statusLabel.color = "0xFF9489FF"
    m.statusLabel.text = m.activateTask.error
    m.keyboard.SetFocus(true)
end sub

sub showHome(name as String)
    m.activationLayer.visible = false
    m.homeLayer.visible = true
    m.top.FindNode("deviceName").text = name
    m.top.FindNode("liveButton").SetFocus(true)
end sub

