sub init()
    m.top.functionName = "activate"
end sub

sub activate()
    transfer = CreateObject("roUrlTransfer")
    transfer.SetUrl(API_URL + "/api/v1/device/activate")
    transfer.SetCertificatesFile("common:/certs/ca-bundle.crt")
    transfer.InitClientCertificates()
    transfer.AddHeader("Content-Type", "application/json")
    transfer.AddHeader("Accept", "application/json")

    response = transfer.PostFromString(FormatJson(m.top.request))
    statusCode = transfer.GetResponseCode()
    if statusCode >= 200 and statusCode < 300 then
        parsed = ParseJson(response)
        if parsed <> invalid then
            m.top.result = parsed
            return
        end if
    end if

    parsedError = ParseJson(response)
    if parsedError <> invalid and parsedError.message <> invalid then
        m.top.error = parsedError.message
    else
        m.top.error = "Não foi possível ativar este dispositivo."
    end if
end sub

