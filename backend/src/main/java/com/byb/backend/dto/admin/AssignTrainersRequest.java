package com.byb.backend.dto.admin;

import jakarta.validation.constraints.NotEmpty;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Body for POST /admin/course-templates/{templateId}/assign — pass the full
 * set of trainerIds that should have this template. The service diffs the
 * current set against this list:
 *   - missing trainers get a new Course offering created (immediately live)
 *   - trainers present here but not previously assigned → newly assigned
 *   - trainers previously assigned but absent from this list → offering soft-deleted
 *
 * The draft / publishImmediately concept was removed — admin owns content,
 * so assigning a template IS publishing it for that trainer.
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AssignTrainersRequest {

    @NotEmpty(message = "At least one trainer must be specified")
    private List<String> trainerIds;
}
