import importlib.util
from pathlib import Path
import pytest

spec = importlib.util.spec_from_file_location('ci_report', Path(__file__).resolve().parents[1] / 'scripts/check_integration_report.py')
ci_report = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci_report)


@pytest.mark.parametrize('state', ['passed', 'skipped', 'failure', 'missing'])
def test_ci_requires_passing_infrastructure_checks(tmp_path, state):
    from xml.etree.ElementTree import Element, SubElement, ElementTree
    root = Element('testsuite')
    for module, name in sorted(ci_report.REQUIRED):
        if name == 'test_redis_atomic_rate_limit' and state == 'missing':
            continue
        case = SubElement(root, 'testcase', classname=module, name=name)
        if name == 'test_redis_atomic_rate_limit' and state in ('skipped', 'failure'):
            SubElement(case, state)
    SubElement(root, 'testcase', classname='tests.test_durable_graph', name='test_resume')
    path = tmp_path / 'report.xml'
    ElementTree(root).write(path)
    if state == 'passed':
        assert ci_report.check_report(path) == len(ci_report.REQUIRED) + 1
    else:
        with pytest.raises(ValueError):
            ci_report.check_report(path)
