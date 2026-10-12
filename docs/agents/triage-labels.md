# Triage labels: Linear mapping

Linear separates _status_ (workflow state) from _labels_ (tags). The canonical
triage roles map to a combination of both.

## State roles

| Canonical role    | Linear                                 |
| ----------------- | -------------------------------------- |
| `needs-triage`    | state `Backlog`                        |
| `needs-info`      | state `Backlog` + label `needs-info`   |
| `ready-for-agent` | state `Todo` + label `ready-for-agent` |
| `ready-for-human` | state `Todo` + label `ready-for-human` |
| `wontfix`         | state `Canceled`                       |

## Category roles

| Canonical role | Linear label               |
| -------------- | -------------------------- |
| `bug`          | `Bug`                      |
| `enhancement`  | `Feature` or `Improvement` |

Apply exactly one category label and one state mapping per triaged issue.
Set state with `save_issue` `state:`; apply labels with `save_issue` `labels:`.
