import unittest
import asyncio
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from fastapi import BackgroundTasks
from fastapi.testclient import TestClient

import main
from main import _normalize_task_status


class TaskStatusTest(unittest.TestCase):
    @patch("main._save_task_center")
    @patch("main.image_node.submit")
    def test_image_async_registers_local_task_before_upstream_submit(
        self,
        submit,
        save_task_center,
    ):
        background_tasks = BackgroundTasks()
        response = main.run_image(main.ImageRequest(
            api_key="secret",
            prompt="cat",
            async_mode=True,
            node_id="result_1",
            project_id="project_1",
            run_id="run_1",
        ), background_tasks)
        local_task_id = response["task_id"]
        try:
            self.assertTrue(response["success"])
            self.assertTrue(response["async"])
            self.assertFalse(submit.called)
            self.assertEqual(len(background_tasks.tasks), 1)
            self.assertEqual(main._task_center[local_task_id]["status"], "running")
            self.assertEqual(main._task_center[local_task_id]["submission_status"], "submitting")
            self.assertEqual(main._task_center[local_task_id]["node_id"], "result_1")
            self.assertEqual(main._task_center[local_task_id]["project_id"], "project_1")
            self.assertEqual(main._task_center[local_task_id]["run_id"], "run_1")
            self.assertTrue(save_task_center.called)
        finally:
            with main._task_center_lock:
                main._task_center.pop(local_task_id, None)

    @patch("main._save_task_center")
    @patch("main.image_node.submit")
    def test_image_background_submit_exception_keeps_failed_local_task(
        self,
        submit,
        save_task_center,
    ):
        submit.side_effect = RuntimeError("upstream exploded")
        background_tasks = BackgroundTasks()
        response = main.run_image(main.ImageRequest(
            api_key="secret",
            prompt="cat",
            async_mode=True,
            node_id="result_failed",
            project_id="project_1",
            run_id="run_failed",
        ), background_tasks)
        local_task_id = response["task_id"]
        try:
            asyncio.run(background_tasks())
            task = main._task_center[local_task_id]
            self.assertEqual(task["status"], "failed")
            self.assertEqual(task["submission_status"], "failed")
            self.assertEqual(task["failure_source"], "backend")
            self.assertIn("图片生成服务异常", task["error"]["message"])
            self.assertIn("upstream exploded", task["error"]["message"])
            self.assertTrue(save_task_center.called)
        finally:
            with main._task_center_lock:
                main._task_center.pop(local_task_id, None)

    @patch("main.image_node.query_task")
    @patch("main.video_node.query_task")
    def test_query_submitting_local_task_does_not_call_upstream(
        self,
        video_query_task,
        image_query_task,
    ):
        local_task_id = "image_submitting_local"
        with main._task_center_lock:
            main._task_center[local_task_id] = {
                "status": "running",
                "type": "image",
                "created_at": 1,
                "api_base_url": "https://api.example.com/v1",
                "api_key": "secret",
                "provider_protocol": "openai",
                "upstream_task_id": "",
                "submission_status": "submitting",
            }
        try:
            response = main.query_task(local_task_id, BackgroundTasks())
        finally:
            with main._task_center_lock:
                main._task_center.pop(local_task_id, None)

        self.assertTrue(response["success"])
        self.assertEqual(response["source"], "task_center")
        self.assertEqual(response["data"]["status"], "running")
        self.assertEqual(response["data"]["submission_status"], "submitting")
        image_query_task.assert_not_called()
        video_query_task.assert_not_called()

    @patch("main._save_task_center")
    @patch("main.video_node.submit")
    def test_video_background_submit_failure_keeps_failed_local_task(
        self,
        submit,
        save_task_center,
    ):
        submit.return_value = {"success": False, "error": "video timeout"}
        background_tasks = BackgroundTasks()
        response = main.run_video(main.VideoRequest(
            api_key="secret",
            prompt="product reveal",
            async_mode=True,
            node_id="result_video_1",
            project_id="project_1",
            run_id="video_run_1",
        ), background_tasks)
        local_task_id = response["task_id"]
        try:
            self.assertFalse(submit.called)
            self.assertEqual(len(background_tasks.tasks), 1)
            asyncio.run(background_tasks())
            task = main._task_center[local_task_id]
            self.assertEqual(task["status"], "failed")
            self.assertEqual(task["type"], "video")
            self.assertEqual(task["node_id"], "result_video_1")
            self.assertEqual(task["project_id"], "project_1")
            self.assertEqual(task["run_id"], "video_run_1")
            self.assertEqual(task["submission_status"], "failed")
            self.assertIn("video timeout", task["error"]["message"])
            self.assertTrue(save_task_center.called)
        finally:
            with main._task_center_lock:
                main._task_center.pop(local_task_id, None)

    @patch("main._save_task_center")
    @patch("main.image_node.submit")
    def test_cancelled_local_task_does_not_start_upstream_submit(
        self,
        submit,
        save_task_center,
    ):
        background_tasks = BackgroundTasks()
        response = main.run_image(main.ImageRequest(
            api_key="secret",
            prompt="cat",
            async_mode=True,
        ), background_tasks)
        local_task_id = response["task_id"]
        try:
            main.cancel_task(local_task_id)
            asyncio.run(background_tasks())
            submit.assert_not_called()
            self.assertEqual(main._task_center[local_task_id]["status"], "cancelled")
            self.assertTrue(save_task_center.called)
        finally:
            with main._task_center_lock:
                main._task_center.pop(local_task_id, None)

    @patch("main._save_task_center")
    @patch("main._persist_task_media")
    @patch("main.image_node.submit")
    def test_cancelled_local_task_ignores_late_submit_result(
        self,
        submit,
        persist_task_media,
        save_task_center,
    ):
        task_holder = {}

        def complete_after_cancel(**_kwargs):
            main.cancel_task(task_holder["task_id"])
            return {
                "success": True,
                "async": False,
                "status": "completed",
                "result": {"images": [{"url": ["https://cdn.example.com/late.png"]}]},
            }

        submit.side_effect = complete_after_cancel
        background_tasks = BackgroundTasks()
        response = main.run_image(main.ImageRequest(
            api_key="secret",
            prompt="cat",
            async_mode=True,
        ), background_tasks)
        local_task_id = response["task_id"]
        task_holder["task_id"] = local_task_id
        try:
            asyncio.run(background_tasks())
            self.assertEqual(main._task_center[local_task_id]["status"], "cancelled")
            self.assertIsNone(main._task_center[local_task_id]["result"])
            persist_task_media.assert_not_called()
            self.assertTrue(save_task_center.called)
        finally:
            with main._task_center_lock:
                main._task_center.pop(local_task_id, None)

    @patch("main._save_task_center")
    @patch("main.image_node.submit")
    def test_image_endpoint_keeps_local_task_when_submit_raises(self, submit, _save_task_center):
        submit.side_effect = RuntimeError("upstream exploded")
        client = TestClient(main.app)
        try:
            response = client.post("/api/image", json={
                "api_key": "secret",
                "prompt": "cat",
                "async_mode": True,
            })
        finally:
            client.close()

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        local_task_id = payload["task_id"]
        try:
            self.assertTrue(payload["success"])
            self.assertTrue(payload["async"])
            task = main._task_center[local_task_id]
            self.assertEqual(task["status"], "failed")
            self.assertIn("图片生成服务异常", task["error"]["message"])
            self.assertIn("upstream exploded", task["error"]["message"])
        finally:
            with main._task_center_lock:
                main._task_center.pop(local_task_id, None)

    @patch("main._save_task_center")
    @patch("main.image_node.submit")
    def test_image_endpoint_keeps_success_when_task_center_persistence_fails(
        self,
        submit,
        save_task_center,
    ):
        task_id = "test_registered_despite_save_failure"
        submit.return_value = {"success": True, "task_id": task_id}
        save_task_center.side_effect = RuntimeError("disk busy")
        client = TestClient(main.app)
        try:
            response = client.post("/api/image", json={
                "api_key": "secret",
                "prompt": "cat",
                "async_mode": True,
                "node_id": "result_1",
                "project_id": "project_1",
                "run_id": "run_1",
            })
        finally:
            client.close()

        try:
            payload = response.json()
            self.assertEqual(response.status_code, 200)
            self.assertTrue(payload["success"])
            local_task_id = payload["task_id"]
            self.assertNotEqual(local_task_id, task_id)
            self.assertEqual(main._task_center[local_task_id]["upstream_task_id"], task_id)
            self.assertEqual(main._task_center[local_task_id]["status"], "running")
            self.assertEqual(main._task_center[local_task_id]["node_id"], "result_1")
            self.assertEqual(main._task_center[local_task_id]["task_center_save_error"], "disk busy")
        finally:
            with main._task_center_lock:
                main._task_center.pop(payload.get("task_id", ""), None)

    def test_generation_in_progress_statuses_normalize_to_running(self):
        for status in ("running", "pending", "processing", "queued", "created", "submitted", "in_progress"):
            with self.subTest(status=status):
                self.assertEqual(_normalize_task_status(status), "running")

    @patch("main._save_task_center")
    @patch("main.video_node.submit")
    def test_video_endpoint_async_registers_video_task(self, submit, save_task_center):
        task_id = "test_video_async_task"
        submit.return_value = {"success": True, "task_id": task_id}
        client = TestClient(main.app)
        try:
            response = client.post("/api/video", json={
                "api_key": "secret",
                "prompt": "product reveal video",
                "async_mode": True,
                "node_id": "result_video_1",
                "project_id": "project_1",
                "run_id": "video_run_1",
                "video_urls": ["https://cdn.example.com/reference.mp4"],
            })
        finally:
            client.close()

        try:
            payload = response.json()
            self.assertEqual(response.status_code, 200)
            self.assertTrue(payload["success"])
            local_task_id = payload["task_id"]
            self.assertNotEqual(local_task_id, task_id)
            self.assertEqual(main._task_center[local_task_id]["upstream_task_id"], task_id)
            self.assertEqual(main._task_center[local_task_id]["status"], "running")
            self.assertEqual(main._task_center[local_task_id]["type"], "video")
            self.assertEqual(main._task_center[local_task_id]["node_id"], "result_video_1")
            self.assertEqual(main._task_center[local_task_id]["project_id"], "project_1")
            self.assertTrue(save_task_center.called)
            submit.assert_called_once()
        finally:
            with main._task_center_lock:
                main._task_center.pop(payload.get("task_id", ""), None)

    def test_terminal_statuses_are_preserved(self):
        for status in ("completed", "failed", "cancelled", "save_failed"):
            with self.subTest(status=status):
                self.assertEqual(_normalize_task_status(status), status)

    def test_legacy_remote_task_is_publicly_marked_save_failed(self):
        public = main._public_task_info({
            "status": "completed",
            "type": "image",
            "result": {
                "images": [{"url": ["https://ts.example.com/a.png"]}],
            },
        })

        self.assertEqual(public["status"], "save_failed")
        self.assertEqual(public["source_urls"], ["https://ts.example.com/a.png"])
        self.assertEqual(public["server_urls"], [])

    @patch("main._save_task_center")
    @patch("main.default_asset_store.localize_url")
    def test_retry_persistence_updates_task_with_server_url(self, localize_url, save_task_center):
        task_id = "test_retry_persistence"
        localize_url.return_value = {"id": "asset-1", "url": "/uploads/a.png"}
        main._task_center[task_id] = {
            "status": "save_failed",
            "type": "image",
            "source_urls": ["https://ts.example.com/a.png"],
            "server_urls": [],
            "media_records": [],
        }
        try:
            task = main._persist_task_media(task_id)
        finally:
            main._task_center.pop(task_id, None)

        self.assertEqual(task["status"], "completed")
        self.assertEqual(task["server_urls"], ["/uploads/a.png"])
        self.assertEqual(task["result"], {"images": [{"url": ["/uploads/a.png"]}]})
        self.assertTrue(save_task_center.called)

    @patch("main._save_task_center")
    @patch("main._persist_task_media")
    @patch("main.image_node.query_task")
    def test_completed_query_returns_saving_before_background_persistence(
        self,
        query_task,
        persist_task_media,
        save_task_center,
    ):
        task_id = "test_async_persistence"
        query_task.return_value = {
            "success": True,
            "data": {
                "status": "completed",
                "result": {
                    "images": [{"url": ["https://ts.example.com/a.png"]}],
                },
            },
        }
        main._task_center[task_id] = {
            "status": "running",
            "type": "image",
            "created_at": 1,
            "api_base_url": "https://api.example.com/v1",
            "api_key": "secret",
        }
        background_tasks = BackgroundTasks()
        try:
            response = main.query_task(task_id, background_tasks)
        finally:
            main._task_center.pop(task_id, None)

        self.assertTrue(response["success"])
        self.assertEqual(response["data"]["status"], "saving")
        self.assertEqual(response["data"]["source_urls"], ["https://ts.example.com/a.png"])
        persist_task_media.assert_not_called()
        self.assertEqual(len(background_tasks.tasks), 1)
        self.assertTrue(save_task_center.called)

    @patch("main._save_task_center")
    @patch("main._persist_task_media")
    @patch("main.image_node.query_task")
    @patch("main.video_node.query_task")
    def test_video_task_query_uses_video_node_and_persists_video_result(
        self,
        video_query_task,
        image_query_task,
        persist_task_media,
        save_task_center,
    ):
        task_id = "test_video_async_persistence"
        video_query_task.return_value = {
            "success": True,
            "data": {
                "status": "completed",
                "result": {
                    "video_url": "https://ts.example.com/video.mp4",
                },
            },
        }
        main._task_center[task_id] = {
            "status": "running",
            "type": "video",
            "created_at": 1,
            "api_base_url": "https://api.example.com/v1",
            "api_key": "secret",
        }
        background_tasks = BackgroundTasks()
        try:
            response = main.query_task(task_id, background_tasks)
        finally:
            main._task_center.pop(task_id, None)

        self.assertTrue(response["success"])
        self.assertEqual(response["data"]["status"], "saving")
        self.assertEqual(response["data"]["source_urls"], ["https://ts.example.com/video.mp4"])
        video_query_task.assert_called_once()
        image_query_task.assert_not_called()
        persist_task_media.assert_not_called()
        self.assertEqual(len(background_tasks.tasks), 1)
        self.assertTrue(save_task_center.called)

    @patch("main._save_task_center")
    @patch("main.image_node.query_task")
    def test_task_query_uses_stored_upstream_id_and_protocol(self, query_task, save_task_center):
        local_task_id = "image_local_1"
        query_task.return_value = {"success": True, "data": {"status": "running"}}
        main._task_center[local_task_id] = {
            "status": "running",
            "type": "image",
            "created_at": 1,
            "api_base_url": "https://api.example.com/v1",
            "api_key": "secret",
            "provider_protocol": "apimart",
            "upstream_task_id": "upstream_1",
        }
        try:
            response = main.query_task(local_task_id, BackgroundTasks())
        finally:
            main._task_center.pop(local_task_id, None)

        self.assertTrue(response["success"])
        query_task.assert_called_once_with(
            task_id="upstream_1",
            api_base_url="https://api.example.com/v1",
            api_key="secret",
            api_protocol="apimart",
        )

    @patch("main._save_task_center")
    @patch("main._persist_task_media")
    @patch("main.image_node.submit")
    def test_sync_image_response_still_returns_local_task_id(
        self,
        submit,
        persist_task_media,
        save_task_center,
    ):
        submit.return_value = {
            "success": True,
            "async": False,
            "status": "completed",
            "result": {"images": [{"url": ["https://cdn.example.com/a.png"]}]},
        }
        background_tasks = BackgroundTasks()
        response = main.run_image(main.ImageRequest(
            api_base_url="https://api.example.com/v1",
            api_key="secret",
            api_protocol="openai",
            prompt="cat",
            async_mode=True,
        ), background_tasks)
        local_task_id = response["task_id"]
        try:
            asyncio.run(background_tasks())
            self.assertTrue(response["success"])
            self.assertTrue(response["async"])
            self.assertTrue(local_task_id.startswith("image_"))
            self.assertEqual(main._task_center[local_task_id]["upstream_task_id"], "")
            self.assertEqual(main._task_center[local_task_id]["provider_protocol"], "openai")
            self.assertEqual(main._task_center[local_task_id]["submission_status"], "completed")
            persist_task_media.assert_called_once_with(local_task_id)
        finally:
            main._task_center.pop(local_task_id, None)

    @patch("main._save_task_center")
    @patch("main.image_node.query_task")
    def test_repeated_query_failures_stop_reporting_generation_as_running(
        self,
        query_task,
        save_task_center,
    ):
        task_id = "test_query_failure"
        query_task.return_value = {"success": False, "error": "upstream timeout"}
        main._task_center[task_id] = {
            "status": "running",
            "type": "image",
            "created_at": 1,
            "api_base_url": "https://api.example.com/v1",
            "api_key": "secret",
        }
        try:
            response = None
            for _ in range(3):
                response = main.query_task(task_id, BackgroundTasks())
        finally:
            main._task_center.pop(task_id, None)

        self.assertTrue(response["success"])
        self.assertEqual(response["data"]["status"], "query_failed")
        self.assertEqual(response["data"]["query_error"], "upstream timeout")
        self.assertEqual(response["data"]["query_failure_count"], 3)
        self.assertTrue(save_task_center.called)

    @patch("main._save_task_center")
    def test_client_failure_report_terminates_running_task(self, save_task_center):
        task_id = "test_client_failure"
        with main._task_center_lock:
            main._task_center[task_id] = {
                "status": "running",
                "type": "image",
                "created_at": 1,
                "node_id": "result_1",
                "project_id": "project_1",
                "run_id": "run_1",
            }
        try:
            response = main.fail_task(task_id, main.TaskFailRequest(
                error="invalid JSON",
                node_id="result_1",
                project_id="project_1",
                run_id="run_1",
            ))
            listed = main.list_tasks(project_id="project_1")
        finally:
            with main._task_center_lock:
                main._task_center.pop(task_id, None)

        self.assertTrue(response["success"])
        self.assertEqual(response["task"]["status"], "failed")
        self.assertEqual(response["task"]["error"]["message"], "invalid JSON")
        self.assertEqual(listed["running"], 0)
        self.assertEqual(listed["failed"], 1)
        self.assertTrue(save_task_center.called)

    @patch("main._save_task_center")
    def test_failure_report_does_not_overwrite_completed_task(self, save_task_center):
        task_id = "test_completed_not_overwritten"
        with main._task_center_lock:
            main._task_center[task_id] = {
                "status": "completed",
                "type": "image",
                "created_at": 1,
                "server_urls": ["/uploads/a.png"],
                "result": {"images": [{"url": ["/uploads/a.png"]}]},
            }
        try:
            response = main.fail_task(task_id, main.TaskFailRequest(error="late client error"))
        finally:
            with main._task_center_lock:
                main._task_center.pop(task_id, None)

        self.assertFalse(response["success"])
        self.assertEqual(response["task"]["status"], "completed")
        save_task_center.assert_not_called()

    def test_task_center_concurrent_registration_and_listing_is_consistent(self):
        with TemporaryDirectory() as temp_dir:
            task_file = Path(temp_dir) / "task_center.json"
            with patch.object(main, "TASK_CENTER_FILE", str(task_file)):
                with main._task_center_lock:
                    original = main._task_center
                    main._task_center = {}
                errors = []

                def register_range(offset):
                    try:
                        for index in range(15):
                            main._register_task(
                                f"concurrent_{offset}_{index}",
                                node_id=f"node_{offset}",
                                project_id="concurrent_project",
                            )
                    except Exception as exc:
                        errors.append(exc)

                def list_repeatedly():
                    try:
                        for _ in range(60):
                            main.list_tasks(project_id="concurrent_project")
                    except Exception as exc:
                        errors.append(exc)

                try:
                    with ThreadPoolExecutor(max_workers=5) as executor:
                        futures = [
                            executor.submit(register_range, offset)
                            for offset in range(4)
                        ]
                        futures.append(executor.submit(list_repeatedly))
                        for future in futures:
                            future.result()

                    persisted = task_file.read_text()
                    self.assertFalse(errors)
                    self.assertEqual(main.list_tasks(project_id="concurrent_project")["total"], 60)
                    self.assertIn("concurrent_0_0", persisted)
                finally:
                    with main._task_center_lock:
                        main._task_center = original

    @patch("main._save_task_center")
    def test_stale_query_failure_cannot_regress_completed_task(self, save_task_center):
        task_id = "test_no_terminal_regression"
        with main._task_center_lock:
            main._task_center[task_id] = {
                "status": "completed",
                "type": "image",
                "created_at": 1,
                "server_urls": ["/uploads/a.png"],
                "result": {"images": [{"url": ["/uploads/a.png"]}]},
            }
        try:
            task = main._record_task_query_failure(task_id, "late timeout")
        finally:
            with main._task_center_lock:
                main._task_center.pop(task_id, None)

        self.assertEqual(task["status"], "completed")
        save_task_center.assert_not_called()

    @patch("main._save_task_center")
    @patch("main.image_node.query_task")
    def test_stale_running_response_cannot_regress_completed_task(
        self,
        query_task,
        save_task_center,
    ):
        task_id = "test_no_running_regression"
        with main._task_center_lock:
            main._task_center[task_id] = {
                "status": "running",
                "type": "image",
                "created_at": 1,
                "api_base_url": "https://api.example.com/v1",
                "api_key": "secret",
                "server_urls": [],
            }

        def complete_then_return_running(**_kwargs):
            with main._task_center_lock:
                main._task_center[task_id].update({
                    "status": "completed",
                    "server_urls": ["/uploads/a.png"],
                    "result": {"images": [{"url": ["/uploads/a.png"]}]},
                })
            return {"success": True, "data": {"status": "running"}}

        query_task.side_effect = complete_then_return_running
        try:
            response = main.query_task(task_id, BackgroundTasks())
        finally:
            with main._task_center_lock:
                main._task_center.pop(task_id, None)

        self.assertEqual(response["data"]["status"], "completed")
        save_task_center.assert_not_called()

    @patch("main._save_task_center")
    def test_cancelled_task_ignores_late_completed_result(self, save_task_center):
        task_id = "test_cancelled_stays_cancelled"
        with main._task_center_lock:
            main._task_center[task_id] = {
                "status": "cancelled",
                "type": "image",
                "created_at": 1,
                "source_urls": [],
                "server_urls": [],
            }
        try:
            task = main._record_task_source_result(
                task_id,
                {"images": [{"url": ["https://ts.example.com/a.png"]}]},
            )
        finally:
            with main._task_center_lock:
                main._task_center.pop(task_id, None)

        self.assertEqual(task["status"], "cancelled")
        save_task_center.assert_not_called()

    @patch("main._save_task_center")
    def test_failed_task_records_finished_duration(self, save_task_center):
        task_id = "test_failed_duration"
        with main._task_center_lock:
            main._task_center[task_id] = {
                "status": "running",
                "type": "image",
                "created_at": 10,
            }
        try:
            with patch("main.time.time", return_value=75):
                task = main._mark_task_failed(task_id, "bad request")
        finally:
            with main._task_center_lock:
                main._task_center.pop(task_id, None)

        self.assertEqual(task["status"], "failed")
        self.assertEqual(task["finished_at"], 75)
        self.assertEqual(task["duration_seconds"], 65)
        self.assertTrue(save_task_center.called)

    @patch("main._save_task_center")
    @patch("main.persist_task_source_urls")
    def test_completed_persistence_records_finished_duration(self, persist_urls, save_task_center):
        task_id = "test_completed_duration"
        persist_urls.return_value = {
            "ok": True,
            "source_urls": ["https://cdn.example.com/a.png"],
            "server_urls": ["/uploads/a.png"],
            "media_records": [{"url": "/uploads/a.png"}],
            "save_error": "",
            "result": {"images": [{"url": ["/uploads/a.png"]}]},
        }
        with main._task_center_lock:
            main._task_center[task_id] = {
                "status": "saving",
                "type": "image",
                "created_at": 20,
                "source_urls": ["https://cdn.example.com/a.png"],
                "server_urls": [],
                "media_records": [],
            }
        try:
            with patch("main.time.time", return_value=95):
                task = main._persist_task_media(task_id)
        finally:
            with main._task_center_lock:
                main._task_center.pop(task_id, None)

        self.assertEqual(task["status"], "completed")
        self.assertEqual(task["finished_at"], 95)
        self.assertEqual(task["duration_seconds"], 75)
        self.assertTrue(save_task_center.called)

    @patch("main._save_task_center")
    def test_query_failed_task_records_finished_duration(self, save_task_center):
        task_id = "test_query_failed_duration"
        with main._task_center_lock:
            main._task_center[task_id] = {
                "status": "running",
                "type": "image",
                "created_at": 30,
                "query_failure_count": main.TASK_QUERY_FAILURE_LIMIT - 1,
            }
        try:
            with patch("main.time.time", return_value=105):
                task = main._record_task_query_failure(task_id, "timeout")
        finally:
            with main._task_center_lock:
                main._task_center.pop(task_id, None)

        self.assertEqual(task["status"], "query_failed")
        self.assertEqual(task["finished_at"], 105)
        self.assertEqual(task["duration_seconds"], 75)
        self.assertTrue(save_task_center.called)

    @patch("main._save_task_center")
    def test_cancelled_task_records_finished_duration(self, save_task_center):
        task_id = "test_cancelled_duration"
        with main._task_center_lock:
            main._task_center[task_id] = {
                "status": "running",
                "type": "image",
                "created_at": 40,
            }
        try:
            with patch("main.time.time", return_value=120):
                response = main.cancel_task(task_id)
                task = main._task_center[task_id]
        finally:
            with main._task_center_lock:
                main._task_center.pop(task_id, None)

        self.assertTrue(response["ok"])
        self.assertEqual(task["status"], "cancelled")
        self.assertEqual(task["cancelled_at"], 120)
        self.assertEqual(task["finished_at"], 120)
        self.assertEqual(task["duration_seconds"], 80)
        self.assertTrue(save_task_center.called)


if __name__ == "__main__":
    unittest.main()
