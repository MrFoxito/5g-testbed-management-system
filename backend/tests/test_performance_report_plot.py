from datetime import datetime, timezone
from matplotlib.figure import Figure
from app.services.performance_reports import plot_series, configure_axis


def test_availability_keeps_holes_and_singletons_visible():
    series = {'object_id': 'nf:amf', 'counter_id': 'core.nf.availability', 'points': [
        {'epoch': t, 'timestamp': datetime.fromtimestamp(t, timezone.utc).isoformat(), 'value': v}
        for t, v in [(1000, 100), (1030, 100), (1060, 0), (1090, 100), (9000, 100)]
    ]}
    axis = Figure().subplots()
    assert plot_series(axis, series, 30) == 1
    configure_axis(axis, [series])
    assert len(axis.lines) == 2
    assert list(axis.lines[0].get_ydata()) == [100, 100, 0, 100]
    assert axis.lines[1].get_marker() == 'o'
    assert axis.lines[0].get_color() == axis.lines[1].get_color()
    assert axis.lines[0].get_drawstyle() == 'steps-post'
    assert axis.get_ylim() == (-5, 105)
