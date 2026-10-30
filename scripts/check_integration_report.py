"""Fail CI if its PostgreSQL/Redis checks were skipped or omitted from pytest's JUnit report."""
import sys
import xml.etree.ElementTree as ET

REQUIRED = {
    ('tests.test_integration', 'test_postgres_concurrent_claim'),
    ('tests.test_integration', 'test_redis_atomic_rate_limit'),
    ('tests.test_integration', 'test_langgraph_rag_with_actual_runtime'),
    ('tests.test_durable_graph', 'test_interrupt_in_one_process_resume_in_another[postgres]'),
    ('tests.test_durable_graph', 'test_concurrent_postgres_checkpointer_setup'),
}


def check_report(path):
    root = ET.parse(path).getroot()
    executed = set()
    for case in root.iter('testcase'):
        identity = (case.get('classname'), case.get('name'))
        infrastructure = identity in REQUIRED or case.get('classname') == 'tests.test_durable_graph'
        if infrastructure:
            if any(case.find(tag) is not None for tag in ('skipped', 'failure', 'error')):
                raise ValueError(f'Infrastructure check did not pass: {identity}')
            executed.add(identity)
    missing = REQUIRED - executed
    if missing:
        raise ValueError(f'Missing infrastructure checks: {sorted(missing)}')
    if not any(module == 'tests.test_durable_graph' for module, _ in executed):
        raise ValueError('Missing durable graph checks')
    return len(executed)


if __name__ == '__main__':
    print(f'{check_report(sys.argv[1])} infrastructure checks executed successfully')
