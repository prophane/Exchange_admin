using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ExchangeWebAdmin.API.Services;

namespace ExchangeWebAdmin.API.Controllers;

[ApiController]
[Route("api/cmdlet-log")]
[Authorize]
public class CmdletLogController : ControllerBase
{
    private readonly CmdletLogService _log;

    public CmdletLogController(CmdletLogService log)
    {
        _log = log;
    }

    [HttpGet]
    public IActionResult GetAll()
    {
        var entries = _log.GetAll().Select((e, _) => new
        {
            e.Index,
            StartTime    = e.StartTime.ToString("dd/MM/yyyy HH:mm:ss"),
            EndTime      = e.EndTime?.ToString("dd/MM/yyyy HH:mm:ss"),
            e.Status,
            e.Command,
            e.DurationMs,
            e.ErrorMessage,
        });
        return Ok(new { success = true, data = entries });
    }

    [HttpDelete]
    public IActionResult Clear()
    {
        _log.Clear();
        return Ok(new { success = true });
    }
}
